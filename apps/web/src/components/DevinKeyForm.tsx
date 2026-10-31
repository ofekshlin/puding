"use client";

import React, { useState } from "react";
import {
  backendRequest,
  BackendError,
  ConnectionSummary,
} from "../lib/backendApi";

const DEVIN_SETTINGS_URL = "https://app.devin.ai/settings";
const DEVIN_API_DOCS_URL = "https://docs.devin.ai/api-reference/overview";

const ERRORS: Record<string, string> = {
  missing_fields: "Enter both the key and the organization ID.",
  legacy_key:
    "That's a legacy apk_ key. Create a cog_ Personal Access Token under Devin Settings → API → PATs.",
  invalid_org: "The organization ID starts with org-.",
  invalid_repo: "Repositories look like owner/repo.",
  rejected: "Devin didn't accept this key for that organization.",
  unreachable: "Couldn't reach Devin to check the key. Try again in a moment.",
  disabled: "Devin is turned off on this Puding server.",
  read_only: "This server has no database, so keys can't be saved here.",
};

function aliasesText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value as Record<string, unknown>)
    .map(([alias, repo]) => `${alias}=${String(repo)}`)
    .join(", ");
}

export interface DevinKeyFormProps {
  connection?: ConnectionSummary;
  onSaved: (connection: ConnectionSummary) => void;
}

/** Pastes a Devin PAT and org ID; the backend checks them with Devin before saving. */
export function DevinKeyForm({ connection, onSaved }: DevinKeyFormProps) {
  const settings = connection?.source === "db" ? connection.settings : {};
  const [apiKey, setApiKey] = useState("");
  const [orgId, setOrgId] = useState(
    connection?.source === "db" ? (connection.accountLabel ?? "") : "",
  );
  const [defaultRepo, setDefaultRepo] = useState(
    typeof settings.defaultRepo === "string" ? settings.defaultRepo : "",
  );
  const [repoAliases, setRepoAliases] = useState(
    aliasesText(settings.repoAliases),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const keyHint =
    typeof settings.keyHint === "string" ? settings.keyHint : undefined;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await backendRequest<ConnectionSummary>(
        "/connections/devin",
        {
          method: "PUT",
          body: { apiKey, orgId, defaultRepo, repoAliases },
        },
      );
      setApiKey("");
      onSaved(saved);
    } catch (err) {
      setError(
        (err instanceof BackendError && err.reason && ERRORS[err.reason]) ||
          "Couldn't save the Devin key.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="settings-form" onSubmit={submit}>
      <label className="settings-field">
        <span>Personal Access Token</span>
        <input
          type="password"
          autoComplete="off"
          placeholder={keyHint ?? "cog_…"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          required
        />
      </label>
      <label className="settings-field">
        <span>Organization ID</span>
        <input
          type="text"
          autoComplete="off"
          placeholder="org-…"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          required
        />
      </label>
      <label className="settings-field">
        <span>Default repository (optional)</span>
        <input
          type="text"
          autoComplete="off"
          placeholder="owner/repo"
          value={defaultRepo}
          onChange={(e) => setDefaultRepo(e.target.value)}
        />
      </label>
      <label className="settings-field">
        <span>Repository nicknames (optional)</span>
        <input
          type="text"
          autoComplete="off"
          placeholder="web=owner/site, api=owner/api"
          value={repoAliases}
          onChange={(e) => setRepoAliases(e.target.value)}
        />
      </label>
      <p className="connection-card-meta">
        Where do I get these? In{" "}
        <a href={DEVIN_SETTINGS_URL} target="_blank" rel="noreferrer">
          Devin Settings
        </a>{" "}
        → API → PATs, create a <code>cog_</code> token; the organization ID (
        <code>org-…</code>) is shown on the same page. See the{" "}
        <a href={DEVIN_API_DOCS_URL} target="_blank" rel="noreferrer">
          Devin API docs
        </a>
        .
      </p>
      {error && (
        <p className="signin-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-primary btn-sm"
        disabled={saving}
      >
        {saving
          ? "Checking with Devin…"
          : connection?.source === "db"
            ? "Replace key"
            : "Connect Devin"}
      </button>
    </form>
  );
}
