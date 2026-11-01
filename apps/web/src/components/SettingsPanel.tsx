"use client";

import React, { useEffect, useState } from "react";
import { signOutOfPuding } from "../app/actions";
import { useMe } from "../hooks/useMe";
import {
  backendRequest,
  BackendError,
  ConnectionSummary,
  Provider,
} from "../lib/backendApi";
import { ConnectionCard } from "./ConnectionCard";
import { DevinKeyForm } from "./DevinKeyForm";
import { NotionTokenForm } from "./NotionTokenForm";
import { SignedInUser, UserMenu } from "./UserMenu";

interface SpotifySlots {
  used: number;
  max: number;
  available: boolean;
}

const CONNECT_ERRORS: Record<string, string> = {
  spotify_state: "That Spotify sign-in link expired. Try connecting again.",
  spotify_denied: "Spotify wasn't connected because the request was declined.",
  spotify_not_allowlisted:
    "Spotify only lets accounts on the Puding app's user list connect. Ask the Puding admin to add your Spotify email under Users Management.",
  spotify_failed: "Couldn't finish connecting Spotify. Try again in a moment.",
  spotify_full:
    "All Spotify slots are taken: Spotify allows only 5 users while Puding's app is in development mode.",
  notion_state: "That Notion sign-in link expired. Try connecting again.",
  notion_denied: "Notion wasn't connected because the request was declined.",
  notion_failed: "Couldn't finish connecting Notion. Try again in a moment.",
  not_configured: "Spotify isn't set up on this Puding server.",
  no_database: "This server has no database, so apps can't be connected here.",
};

const CONNECTED_NOTICES: Record<string, string> = {
  spotify: "Spotify is connected.",
  notion: "Notion is connected.",
};

/** Connect, reconnect and disconnect your own apps; delete the account. */
export function SettingsPanel({ user }: { user: SignedInUser }) {
  const { me, setMe } = useMe();
  const [busy, setBusy] = useState<Provider | "account" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [spotifySlots, setSpotifySlots] = useState<SpotifySlots | null>(null);
  const [notionOAuth, setNotionOAuth] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const failed = params.get("error");
    if (connected) setNotice(CONNECTED_NOTICES[connected] ?? null);
    if (failed) setError(CONNECT_ERRORS[failed] ?? "Couldn't connect the app.");
    if (connected || failed) window.history.replaceState(null, "", "/settings");
    backendRequest<SpotifySlots>("/connections/spotify/slots")
      .then(setSpotifySlots)
      .catch(() => undefined);
    backendRequest<{ oauth: boolean }>("/connections/notion/options")
      .then((options) => setNotionOAuth(options.oauth))
      .catch(() => undefined);
  }, []);

  const connectionFor = (provider: Provider) =>
    me?.connections.find((c) => c.provider === provider);

  const replaceConnection = (
    provider: Provider,
    connection: ConnectionSummary | null,
  ) =>
    setMe(
      (current) =>
        current && {
          ...current,
          connections: [
            ...current.connections.filter((c) => c.provider !== provider),
            ...(connection ? [connection] : []),
          ],
        },
    );

  const disconnect = async (provider: Provider) => {
    setBusy(provider);
    setError(null);
    try {
      await backendRequest<void>(`/connections/${provider}`, {
        method: "DELETE",
      });
      replaceConnection(provider, null);
    } catch (err) {
      setError(
        err instanceof BackendError && err.reason === "read_only"
          ? "This server has no database, so connections can't be changed here."
          : `Couldn't disconnect ${provider}.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const startConnect = async (provider: "spotify" | "notion") => {
    setBusy(provider);
    setError(null);
    try {
      const { url } = await backendRequest<{ url: string }>(
        `/connections/${provider}/authorize`,
        { method: "POST" },
      );
      window.location.assign(url);
    } catch (err) {
      setError(
        (err instanceof BackendError &&
          err.reason &&
          CONNECT_ERRORS[err.reason]) ||
          `Couldn't start connecting ${provider === "spotify" ? "Spotify" : "Notion"}.`,
      );
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    if (
      !window.confirm(
        "Delete your Puding account and every connected app? This can't be undone.",
      )
    ) {
      return;
    }
    setBusy("account");
    setError(null);
    try {
      await backendRequest<void>("/me", { method: "DELETE" });
      await signOutOfPuding();
    } catch (err) {
      setError(
        err instanceof BackendError && err.reason === "no_database"
          ? "This server has no database, so there is no stored account to delete."
          : "Couldn't delete the account. Try again in a moment.",
      );
      setBusy(null);
    }
  };

  const approved = me?.status === "approved";

  return (
    <div className="container">
      <main className="card admin-panel">
        <UserMenu
          user={user}
          isAdmin={me?.role === "admin"}
          pendingRequests={me?.pendingRequests}
        />
        <header className="logo-container">
          <h1 className="title">Settings</h1>
          <p className="subtitle">
            <a href="/">← Back to Puding</a>
          </p>
        </header>

        {error && (
          <p className="signin-error" role="alert">
            {error}
          </p>
        )}

        {notice && (
          <p className="admin-reminder" role="status">
            {notice}
          </p>
        )}

        {!me && <p className="account-text">Loading…</p>}

        {me && !approved && (
          <p className="account-text">
            You can connect apps once your account is approved.
          </p>
        )}

        {approved && (
          <>
            <p className="account-text">
              Each app is connected to your account only. Web search is shared
              and always on.
            </p>

            <ConnectionCard
              title="Devin"
              description="Start and check Devin coding sessions by voice."
              connection={connectionFor("devin")}
              busy={busy === "devin"}
              onDisconnect={() => disconnect("devin")}
            >
              <DevinKeyForm
                key={connectionFor("devin")?.accountLabel ?? "new"}
                connection={connectionFor("devin")}
                onSaved={(c) => replaceConnection("devin", c)}
              />
            </ConnectionCard>

            <ConnectionCard
              title="Spotify"
              description="Play, pause and pick music on your own Spotify account."
              connection={connectionFor("spotify")}
              busy={busy === "spotify"}
              onDisconnect={() => disconnect("spotify")}
            >
              {spotifySlots && (
                <p className="connection-card-meta">
                  {spotifySlots.used} of {spotifySlots.max} Spotify slots used.
                  While Puding&apos;s Spotify app is in development mode,
                  Spotify only lets accounts the admin added under Users
                  Management connect.
                </p>
              )}
              {spotifySlots?.available !== false && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy === "spotify"}
                  onClick={() => startConnect("spotify")}
                >
                  {connectionFor("spotify")?.source === "db"
                    ? "Reconnect Spotify"
                    : "Connect Spotify"}
                </button>
              )}
            </ConnectionCard>

            <ConnectionCard
              title="Notion"
              description="Search and update your Notion pages."
              connection={connectionFor("notion")}
              busy={busy === "notion"}
              onDisconnect={() => disconnect("notion")}
            >
              {notionOAuth && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy === "notion"}
                    onClick={() => startConnect("notion")}
                  >
                    {connectionFor("notion")?.source === "db"
                      ? "Reconnect Notion"
                      : "Connect Notion"}
                  </button>
                  <p className="connection-card-meta">
                    Notion asks which pages Puding may use. Or paste an
                    integration token instead:
                  </p>
                </>
              )}
              <NotionTokenForm
                onSaved={(c) => replaceConnection("notion", c)}
              />
            </ConnectionCard>

            <ConnectionCard
              title="Web search"
              description="Shared by everyone on this Puding server, with a daily limit per user."
              shared
            />
          </>
        )}

        {me && (
          <section className="connection-card danger-zone">
            <h2 className="connection-card-title">Delete account</h2>
            <p className="connection-card-text">
              Removes your Puding account and every connected app from this
              server, then signs you out.
            </p>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy === "account"}
              onClick={deleteAccount}
            >
              {busy === "account" ? "Deleting…" : "Delete my account"}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
