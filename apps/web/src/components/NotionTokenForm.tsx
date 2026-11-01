"use client";

import React, { useState } from "react";
import {
  backendRequest,
  BackendError,
  ConnectionSummary,
} from "../lib/backendApi";

const NOTION_INTEGRATIONS_URL = "https://www.notion.so/profile/integrations";

const ERRORS: Record<string, string> = {
  missing_token: "Paste the integration's secret first.",
  rejected: "Notion didn't accept this token.",
  unreachable:
    "Couldn't reach Notion to check the token. Try again in a moment.",
  read_only: "This server has no database, so tokens can't be saved here.",
};

export interface NotionTokenFormProps {
  onSaved: (connection: ConnectionSummary) => void;
}

/** Fallback to OAuth: paste an internal integration token, checked with Notion before saving. */
export function NotionTokenForm({ onSaved }: NotionTokenFormProps) {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const connection = await backendRequest<ConnectionSummary>(
        "/connections/notion/token",
        { method: "PUT", body: { token } },
      );
      setToken("");
      onSaved(connection);
    } catch (err) {
      setError(
        (err instanceof BackendError && err.reason && ERRORS[err.reason]) ||
          "Couldn't save the token.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="settings-form" onSubmit={submit}>
      <label className="settings-field">
        <span>Integration token</span>
        <input
          type="password"
          autoComplete="off"
          placeholder="ntn_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      <p className="connection-card-meta">
        Create an internal integration at{" "}
        <a href={NOTION_INTEGRATIONS_URL} target="_blank" rel="noreferrer">
          notion.so/profile/integrations
        </a>
        , copy its secret, then share the pages Puding should use with it.
      </p>
      {error && (
        <p className="signin-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-secondary btn-sm"
        disabled={saving || !token.trim()}
      >
        {saving ? "Checking…" : "Save token"}
      </button>
    </form>
  );
}
