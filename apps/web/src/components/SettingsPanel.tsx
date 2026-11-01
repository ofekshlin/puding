"use client";

import React, { useState } from "react";
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
import { SignedInUser, UserMenu } from "./UserMenu";

/** Spotify apps in development mode allow at most five users, owner included. */
const SPOTIFY_DEV_MODE_LIMIT = 5;

/** Connect, reconnect and disconnect your own apps; delete the account. */
export function SettingsPanel({ user }: { user: SignedInUser }) {
  const { me, setMe } = useMe();
  const [busy, setBusy] = useState<Provider | "account" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
              <p className="connection-card-meta">
                Connecting your own Spotify account is coming soon. While the
                Puding Spotify app is in development mode, Spotify allows at
                most {SPOTIFY_DEV_MODE_LIMIT} users.
              </p>
            </ConnectionCard>

            <ConnectionCard
              title="Notion"
              description="Search and update your Notion pages."
              connection={connectionFor("notion")}
              busy={busy === "notion"}
              onDisconnect={() => disconnect("notion")}
            >
              <p className="connection-card-meta">
                Connecting your own Notion workspace is coming soon.
              </p>
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
