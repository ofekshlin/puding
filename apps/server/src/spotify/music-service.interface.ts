/**
 * A playable music track resolved from the provider's catalog.
 */
export interface Track {
  id: string;
  uri: string;
  name: string;
  artist: string;
  album?: string;
  imageUrl?: string;
}

/**
 * The outcome of a playback command.
 */
export interface PlaybackResult {
  track: Track;
  device?: string;
}

/**
 * The outcome of adding a track to a playlist.
 */
export interface PlaylistAdditionResult {
  track: Track;
  playlist: { id: string; name: string };
}

/**
 * Abstract token class representing a media playback provider.
 * Tools depend on this abstraction rather than on a concrete provider client.
 */
export abstract class MusicService {
  /**
   * Finds the best matching track for a free-text query.
   */
  abstract searchTrack(query: string): Promise<Track>;

  /**
   * Starts playback of the best matching track on the active device.
   */
  abstract playTrack(
    query: string,
    deviceName?: string,
  ): Promise<PlaybackResult>;

  /**
   * Appends the best matching track to the current playback queue.
   */
  abstract queueTrack(query: string): Promise<PlaybackResult>;

  /**
   * Appends the best matching track to a playlist resolved by name.
   */
  abstract addTrackToPlaylist(
    query: string,
    playlistName: string,
  ): Promise<PlaylistAdditionResult>;
}
