import React, { useState } from "react";

interface AccessTokenPromptProps {
  onSubmit: (token: string) => void;
}

export const AccessTokenPrompt: React.FC<AccessTokenPromptProps> = ({
  onSubmit,
}) => {
  const [token, setToken] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    onSubmit(token.trim());
    setToken("");
  };

  return (
    <form onSubmit={handleSubmit} className="access-token-prompt">
      <label htmlFor="access-token" className="access-token-label">
        This Puding server needs an access token.
      </label>
      <div className="chat-input-container">
        <input
          id="access-token"
          type="password"
          autoComplete="current-password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Access token"
          className="chat-input-field"
          autoFocus
        />
        <button
          type="submit"
          disabled={!token.trim()}
          className="btn btn-primary access-token-submit"
        >
          Connect
        </button>
      </div>
    </form>
  );
};
