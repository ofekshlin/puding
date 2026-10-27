"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  backendRequest,
  BackendError,
  PudingUser,
  UserStatus,
} from "../lib/backendApi";
import { SignedInUser, UserMenu } from "./UserMenu";

/** Spotify apps in development mode allow at most five users, owner included. */
const SPOTIFY_DEV_MODE_LIMIT = 5;
const SPOTIFY_DASHBOARD_URL = "https://developer.spotify.com/dashboard";

const SECTIONS: { status: UserStatus; title: string }[] = [
  { status: "pending", title: "Access requests" },
  { status: "approved", title: "Approved" },
  { status: "rejected", title: "Rejected" },
];

function formatDate(iso?: string): string | null {
  return iso ? new Date(iso).toLocaleString() : null;
}

/** Approve, reject and revoke Puding accounts. */
export function AdminPanel({ user }: { user: SignedInUser }) {
  const [users, setUsers] = useState<PudingUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [justApproved, setJustApproved] = useState<PudingUser | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(
        (await backendRequest<{ users: PudingUser[] }>("/admin/users")).users,
      );
      setError(null);
    } catch (err) {
      setError(
        err instanceof BackendError && err.status === 403
          ? "Only admins can open this page."
          : "Couldn't load users. The server may be waking up; try again in a moment.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (target: PudingUser, action: "approve" | "reject") => {
    setBusyId(target.id);
    try {
      const updated = await backendRequest<PudingUser>(
        `/admin/users/${encodeURIComponent(target.id)}/${action}`,
        { method: "POST" },
      );
      setUsers((list) =>
        list ? list.map((u) => (u.id === updated.id ? updated : u)) : list,
      );
      setJustApproved(action === "approve" ? updated : null);
      setError(null);
    } catch {
      setError(`Couldn't ${action} ${target.email}.`);
    } finally {
      setBusyId(null);
    }
  };

  const byStatus = (status: UserStatus) =>
    (users ?? []).filter((u) => u.status === status);
  const pendingCount = byStatus("pending").length;
  const approvedCount = byStatus("approved").length;

  return (
    <div className="container">
      <main className="card admin-panel">
        <UserMenu user={user} />
        <header className="logo-container">
          <h1 className="title">
            Admin{" "}
            {pendingCount > 0 && (
              <span className="badge" aria-label={`${pendingCount} waiting`}>
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="subtitle">
            <a href="/">← Back to Puding</a>
          </p>
        </header>

        {error && (
          <p className="signin-error" role="alert">
            {error}
          </p>
        )}

        {justApproved && (
          <p className="admin-reminder" role="status">
            Approved {justApproved.email}. To let them use Spotify, add this
            email under <strong>Users Management</strong> in the{" "}
            <a href={SPOTIFY_DASHBOARD_URL} target="_blank" rel="noreferrer">
              Spotify dashboard
            </a>{" "}
            ({approvedCount} of {SPOTIFY_DEV_MODE_LIMIT} development-mode
            users).
          </p>
        )}

        {users === null && !error && <p className="account-text">Loading…</p>}

        {users &&
          SECTIONS.map(({ status, title }) => {
            const list = byStatus(status);
            return (
              <section key={status} className="admin-section">
                <h2 className="admin-section-title">
                  {title} ({list.length})
                </h2>
                {list.length === 0 && (
                  <p className="account-text">Nobody here.</p>
                )}
                <ul className="admin-list">
                  {list.map((u) => (
                    <li key={u.id} className="admin-user">
                      <div className="admin-user-info">
                        <span className="admin-user-email">{u.email}</span>
                        {u.name && (
                          <span className="admin-user-meta">{u.name}</span>
                        )}
                        {u.requestNote && (
                          <span className="admin-user-note">
                            “{u.requestNote}”
                          </span>
                        )}
                        <span className="admin-user-meta">
                          {u.status === "pending"
                            ? `Requested ${formatDate(u.requestedAt ?? u.createdAt) ?? "—"}`
                            : `Decided ${formatDate(u.decidedAt) ?? "automatically"}`}
                          {u.role === "admin" && " · admin"}
                        </span>
                      </div>
                      <div className="admin-user-actions">
                        {u.status !== "approved" && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busyId === u.id}
                            onClick={() => decide(u, "approve")}
                          >
                            Approve
                          </button>
                        )}
                        {u.status !== "rejected" && u.role !== "admin" && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={busyId === u.id}
                            onClick={() => decide(u, "reject")}
                          >
                            {u.status === "approved" ? "Revoke" : "Reject"}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
      </main>
    </div>
  );
}
