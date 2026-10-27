"use client";

import React, { useState } from "react";
import { backendRequest, BackendError, MeResponse } from "../lib/backendApi";
import { SignedInUser, UserMenu } from "./UserMenu";

const MAX_NOTE_LENGTH = 500;

export interface AccessRequestScreenProps {
  user: SignedInUser;
  me: MeResponse;
  onUpdated: (me: MeResponse) => void;
  onRefresh: () => void;
}

/** Pending users ask for access (with an optional note) and wait for an admin. */
export function AccessRequestScreen({
  user,
  me,
  onUpdated,
  onRefresh,
}: AccessRequestScreenProps) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRequest = me.signupMode === "request" && !me.requestedAt;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      onUpdated(
        await backendRequest<MeResponse>("/me/access-request", {
          method: "POST",
          body: { note },
        }),
      );
    } catch (err) {
      setError(
        err instanceof BackendError && err.reason === "requests_closed"
          ? "Puding isn't taking access requests right now."
          : "Couldn't send your request. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container">
      <main className="card account-screen">
        <UserMenu user={user} />
        <header className="logo-container">
          <h1 className="title">Puding 🍮</h1>
          <p className="subtitle">
            {canRequest ? "Request access" : "Waiting for approval"}
          </p>
        </header>

        {canRequest ? (
          <form className="access-request-form" onSubmit={submit}>
            <label htmlFor="request-note" className="account-text">
              Puding is invite-only. Tell the admin who you are (optional).
            </label>
            <textarea
              id="request-note"
              className="access-request-note"
              value={note}
              maxLength={MAX_NOTE_LENGTH}
              rows={3}
              placeholder="e.g. Ofek's friend from work"
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={sending}
            >
              {sending ? "Sending…" : "Request access"}
            </button>
          </form>
        ) : (
          <>
            <p className="account-text">
              {me.requestedAt
                ? "Your request was sent. You'll get in as soon as an admin approves it."
                : "Your account is waiting for an admin to approve it."}
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRefresh}
            >
              Check again
            </button>
          </>
        )}

        {error && (
          <p className="signin-error" role="alert">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
