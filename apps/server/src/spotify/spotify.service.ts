import { Injectable, Logger, Inject } from "@nestjs/common";
import { SpotifyAuthService } from "./spotify-auth.service";
import {
  MusicService,
  PlaybackResult,
  PlaylistAdditionResult,
  Track,
} from "./music-service.interface";

const API_BASE_URL = "https://api.spotify.com/v1";
/** Dev Mode caps the search limit at 10 since February 2026. */
const SEARCH_LIMIT = 5;
const PLAYLIST_PAGE_LIMIT = 50;

interface SpotifyDevice {
  id: string | null;
  name: string;
  is_active: boolean;
}

interface SpotifyTrackItem {
  id: string;
  uri: string;
  name: string;
  artists?: Array<{ name: string }>;
  album?: { name?: string; images?: Array<{ url: string }> };
}

interface SpotifyPlaylistItem {
  id: string;
  name: string;
}

/**
 * Spotify Web API implementation of the `MusicService` abstraction.
 *
 * The Web API controls existing Spotify players; it does not stream audio.
 * All `/me/player/*` endpoints require the account to have Spotify Premium.
 */
@Injectable()
export class SpotifyService extends MusicService {
  private readonly logger = new Logger(SpotifyService.name);

  constructor(
    @Inject(SpotifyAuthService)
    private readonly authService: SpotifyAuthService,
  ) {
    super();
  }

  public async searchTrack(query: string): Promise<Track> {
    this.logger.log(`Searching Spotify for track: "${query}"`);

    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: String(SEARCH_LIMIT),
    });
    const data = await this.request<{
      tracks?: { items?: SpotifyTrackItem[] };
    }>("GET", `/search?${params.toString()}`);

    const item = data?.tracks?.items?.[0];
    if (!item) {
      throw new Error(`No track matching "${query}" was found on Spotify.`);
    }

    return this.toTrack(item);
  }

  public async playTrack(
    query: string,
    deviceName?: string,
  ): Promise<PlaybackResult> {
    const track = await this.searchTrack(query);
    const device = await this.resolveDevice(deviceName);

    await this.request("PUT", `/me/player/play?device_id=${device.id}`, {
      uris: [track.uri],
    });

    this.logger.log(
      `Playing "${track.name}" by ${track.artist} on device "${device.name}".`,
    );
    return { track, device: device.name };
  }

  public async queueTrack(query: string): Promise<PlaybackResult> {
    const track = await this.searchTrack(query);
    const device = await this.resolveDevice();

    const params = new URLSearchParams({
      uri: track.uri,
      device_id: device.id,
    });
    await this.request("POST", `/me/player/queue?${params.toString()}`);

    this.logger.log(
      `Queued "${track.name}" by ${track.artist} on device "${device.name}".`,
    );
    return { track, device: device.name };
  }

  public async addTrackToPlaylist(
    query: string,
    playlistName: string,
  ): Promise<PlaylistAdditionResult> {
    const track = await this.searchTrack(query);
    const playlist = await this.resolvePlaylist(playlistName);

    // The `/tracks` variant of this endpoint was removed in February 2026.
    await this.request("POST", `/playlists/${playlist.id}/items`, {
      uris: [track.uri],
    });

    this.logger.log(
      `Added "${track.name}" by ${track.artist} to playlist "${playlist.name}".`,
    );
    return { track, playlist };
  }

  /**
   * Picks the target device: the active one, an explicit name match,
   * or the only available device.
   */
  private async resolveDevice(
    deviceName?: string,
  ): Promise<{ id: string; name: string }> {
    const data = await this.request<{ devices?: SpotifyDevice[] }>(
      "GET",
      "/me/player/devices",
    );
    const devices = (data?.devices ?? []).filter(
      (device): device is SpotifyDevice & { id: string } => Boolean(device.id),
    );

    if (devices.length === 0) {
      throw new Error(
        "No active Spotify device was found. Open Spotify on a device and try again.",
      );
    }

    if (deviceName) {
      const wanted = deviceName.toLowerCase();
      const match =
        devices.find((device) => device.name.toLowerCase() === wanted) ??
        devices.find((device) => device.name.toLowerCase().includes(wanted));

      if (!match) {
        const available = devices.map((device) => device.name).join(", ");
        throw new Error(
          `No Spotify device named "${deviceName}" was found. Available devices: ${available}.`,
        );
      }
      return { id: match.id, name: match.name };
    }

    const target = devices.find((device) => device.is_active) ?? devices[0];
    return { id: target.id, name: target.name };
  }

  /**
   * Resolves a playlist owned by (or followed by) the user, by name.
   */
  private async resolvePlaylist(
    playlistName: string,
  ): Promise<{ id: string; name: string }> {
    const wanted = playlistName.trim().toLowerCase();
    let next: string | undefined =
      `/me/playlists?limit=${PLAYLIST_PAGE_LIMIT}`;
    let fallback: SpotifyPlaylistItem | undefined;

    while (next) {
      const page: { items?: SpotifyPlaylistItem[]; next?: string | null } =
        await this.request<{
          items?: SpotifyPlaylistItem[];
          next?: string | null;
        }>("GET", next);

      for (const playlist of page?.items ?? []) {
        const name = playlist.name?.toLowerCase() ?? "";
        if (name === wanted) {
          return { id: playlist.id, name: playlist.name };
        }
        if (!fallback && name.includes(wanted)) {
          fallback = playlist;
        }
      }

      next = page?.next ?? undefined;
    }

    if (fallback) {
      return { id: fallback.id, name: fallback.name };
    }

    throw new Error(`No Spotify playlist named "${playlistName}" was found.`);
  }

  private toTrack(item: SpotifyTrackItem): Track {
    return {
      id: item.id,
      uri: item.uri,
      name: item.name,
      artist:
        item.artists?.map((artist) => artist.name).join(", ") ||
        "Unknown Artist",
      album: item.album?.name,
      imageUrl: item.album?.images?.[0]?.url,
    };
  }

  /**
   * Performs an authenticated Web API call, refreshing the access token once
   * on `401` and honouring a single `429` retry.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    isRetry = false,
  ): Promise<T> {
    const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
    const accessToken = await this.authService.getAccessToken();

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (response.ok) {
      if (response.status === 204) {
        return undefined as T;
      }
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    if (response.status === 401 && !isRetry) {
      this.logger.warn("Spotify access token rejected; refreshing and retry.");
      await this.authService.refreshAccessToken();
      return this.request<T>(method, path, body, true);
    }

    if (response.status === 429 && !isRetry) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? 1);
      this.logger.warn(`Spotify rate limited; retrying in ${retryAfter}s.`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return this.request<T>(method, path, body, true);
    }

    throw new Error(await this.describeError(response, method, path));
  }

  private async describeError(
    response: Response,
    method: string,
    path: string,
  ): Promise<string> {
    const details = await response.text();
    this.logger.error(
      `Spotify request ${method} ${path} failed with status ${response.status}: ${details}`,
    );

    switch (response.status) {
      case 403:
        return "Spotify rejected the request. Playback control requires a Spotify Premium account.";
      case 404:
        return "No active Spotify device was found. Open Spotify on a device and try again.";
      case 429:
        return "Spotify is rate limiting requests. Please try again in a moment.";
      default:
        return `Spotify request failed with status ${response.status}.`;
    }
  }
}
