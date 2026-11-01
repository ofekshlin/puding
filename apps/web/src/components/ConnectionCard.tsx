import React from "react";
import { ConnectionSummary } from "../lib/backendApi";

export interface ConnectionCardProps {
  title: string;
  description: string;
  connection?: ConnectionSummary;
  /** A shared service that every user has without connecting anything. */
  shared?: boolean;
  /** Shown instead of the Disconnect button while the card is busy. */
  busy?: boolean;
  onDisconnect?: () => void;
  /** Connect / Reconnect controls, or a note when connecting is not possible yet. */
  children?: React.ReactNode;
}

function statusOf(
  connection?: ConnectionSummary,
  shared?: boolean,
): {
  label: string;
  tone: "on" | "off" | "error";
} {
  if (shared) return { label: "Shared, always on", tone: "on" };
  if (!connection || connection.kind === "disconnected") {
    return { label: "Not connected", tone: "off" };
  }
  if (connection.lastError)
    return { label: "Needs reconnecting", tone: "error" };
  return {
    label: connection.source === "env" ? "Connected (server)" : "Connected",
    tone: "on",
  };
}

/** One app on the Settings page: its status, account, and connect controls. */
export function ConnectionCard({
  title,
  description,
  connection,
  shared,
  busy,
  onDisconnect,
  children,
}: ConnectionCardProps) {
  const status = statusOf(connection, shared);
  const connected = status.tone !== "off";
  return (
    <section className="connection-card" aria-label={title}>
      <div className="connection-card-header">
        <h2 className="connection-card-title">{title}</h2>
        <span className={`connection-status connection-status-${status.tone}`}>
          {status.label}
        </span>
      </div>
      <p className="connection-card-text">{description}</p>
      {connected && connection?.accountLabel && (
        <p className="connection-card-meta">
          Account: {connection.accountLabel}
        </p>
      )}
      {connection?.lastError && (
        <p className="connection-card-meta" role="alert">
          {connection.lastError}
        </p>
      )}
      {children}
      {connected && onDisconnect && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={onDisconnect}
        >
          {busy ? "Disconnecting…" : "Disconnect"}
        </button>
      )}
    </section>
  );
}
