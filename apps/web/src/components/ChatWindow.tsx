import React, { useEffect, useRef, useState } from "react";
import { ChatMessage } from "../hooks/useLiveSession";

interface ChatWindowProps {
  messages: ChatMessage[];
  isThinking: boolean;
}

interface IntegrationCardProps {
  data: any;
}

const SpotifyCard: React.FC<IntegrationCardProps> = ({ data }) => (
  <div className="integration-card spotify-card">
    <div className="card-header">
      <span className="card-icon">🎵</span>
      <span className="card-title">Spotify Playback</span>
      {data.action && <span className="badge spotify-badge">{data.action}</span>}
    </div>
    <div className="card-body spotify-body">
      {data.albumArt && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="album-art"
          src={data.albumArt}
          alt={`${data.track || "Album"} cover art`}
        />
      )}
      <div className="track-details">
        <strong className="track-name">{data.track || "Unknown Track"}</strong>
        <span className="artist-name">{data.artist || "Unknown Artist"}</span>
        {data.playlist && (
          <span className="playlist-name">Playlist: {data.playlist}</span>
        )}
      </div>
    </div>
    {data.isPlaying && (
      <div className="playback-indicator">
        <span className="bar"></span>
        <span className="bar"></span>
        <span className="bar"></span>
      </div>
    )}
  </div>
);

const NotionCard: React.FC<IntegrationCardProps> = ({ data }) => (
  <div className="integration-card notion-card">
    <div className="card-header">
      <span className="card-icon">📝</span>
      <span className="card-title">Notion Workspace</span>
    </div>
    <div className="card-body">
      <strong className="doc-title">{data.title || "Untitled Page"}</strong>
      <p className="doc-summary">{data.summary || "Summary..."}</p>
    </div>
    <div className="card-footer">
      <span className="badge">{data.action || "Database Logged"}</span>
    </div>
  </div>
);

const DefaultIntegrationCard: React.FC<IntegrationCardProps> = ({ data }) => (
  <div className="integration-card default-card">
    <pre>{JSON.stringify(data, null, 2)}</pre>
  </div>
);

const SearchCard: React.FC<IntegrationCardProps> = ({ data }) => (
  <div className="integration-card search-card">
    <div className="card-header">
      <span className="card-icon">🔍</span>
      <span className="card-title">Web Search</span>
    </div>
    <div className="card-body">
      <strong className="search-query">Query: &quot;{data.query}&quot;</strong>
      <div className="search-results-list">
        {data.results && data.results.length > 0 ? (
          data.results.map((res: any, idx: number) => (
            <div key={idx} className="search-result-item">
              <a
                href={res.url}
                target="_blank"
                rel="noopener noreferrer"
                className="search-result-link"
              >
                {res.title}
              </a>
              <p className="search-result-snippet">{res.snippet}</p>
            </div>
          ))
        ) : (
          <p className="search-no-results">No results found.</p>
        )}
      </div>
    </div>
  </div>
);

const DEVIN_STATE_LABELS: Record<string, string> = {
  working: "Working",
  waiting_for_user: "Needs you",
  waiting_for_approval: "Needs approval",
  finished: "Finished",
  sleeping: "Asleep",
  stopped: "Stopped",
};

const safeHref = (url?: string) =>
  url && /^https:\/\//.test(url) ? url : undefined;

const DevinStateBadge: React.FC<{ state: string }> = ({ state }) => (
  <span className={`badge devin-badge devin-state-${state}`}>
    {DEVIN_STATE_LABELS[state] ?? state}
  </span>
);

const DevinHeader: React.FC<{
  title: string;
  children?: React.ReactNode;
}> = ({ title, children }) => (
  <div className="card-header">
    <span className="card-icon">🤖</span>
    <span className="card-title">{title}</span>
    {children}
  </div>
);

const DevinOpenLink: React.FC<{ url?: string }> = ({ url }) => {
  const href = safeHref(url);
  return href ? (
    <a
      className="devin-open-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      Open in Devin
    </a>
  ) : null;
};

const DevinSessionCard: React.FC<IntegrationCardProps> = ({ data }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="integration-card devin-card">
      <DevinHeader title="Devin Session">
        <DevinStateBadge state={data.state} />
      </DevinHeader>
      <div className="card-body">
        <strong className="devin-title">{data.title}</strong>
        {data.stateReason && (
          <span className="devin-muted">{data.stateReason}</span>
        )}
        {data.latestMessage && (
          <>
            <div
              className={`devin-message ${expanded ? "expanded" : "collapsed"}`}
            >
              {data.latestMessage}
            </div>
            <button
              type="button"
              className="devin-toggle"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          </>
        )}
        {data.pullRequests?.length > 0 && (
          <div className="devin-prs">
            {data.pullRequests.map((pr: any, idx: number) => (
              <a
                key={idx}
                href={safeHref(pr.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Pull request {idx + 1}
                {pr.state ? ` (${pr.state})` : ""}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="card-footer">
        <DevinOpenLink url={data.url} />
      </div>
    </div>
  );
};

const DevinSessionListCard: React.FC<IntegrationCardProps> = ({ data }) => (
  <div className="integration-card devin-card">
    <DevinHeader title="Devin Sessions" />
    <div className="card-body">
      {data.sessions?.length ? (
        <ol className="devin-list">
          {data.sessions.map((s: any) => (
            <li key={s.index} className="devin-list-row">
              <span className="devin-index">{s.index}</span>
              <a
                href={safeHref(s.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {s.title}
              </a>
              <DevinStateBadge state={s.state} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="devin-muted">No sessions.</p>
      )}
    </div>
  </div>
);

const DevinReadingCard: React.FC<IntegrationCardProps> = ({ data }) => {
  const total = data.sections?.length ?? 0;
  const progress =
    data.current < 0
      ? "Outline"
      : data.current >= total
        ? "Done"
        : `${data.current + 1} of ${total}`;
  return (
    <div className="integration-card devin-card">
      <DevinHeader title="Reading">
        <span className="badge devin-badge">{progress}</span>
      </DevinHeader>
      <div className="card-body">
        <strong className="devin-title">{data.title}</strong>
        {data.sections?.map((section: any, idx: number) => (
          <div
            key={idx}
            className={`devin-section ${idx === data.current ? "current" : ""}`}
          >
            <span className="devin-section-heading">{section.heading}</span>
            <p>{section.text}</p>
          </div>
        ))}
      </div>
      <div className="card-footer">
        <DevinOpenLink url={data.url} />
      </div>
    </div>
  );
};

const DevinQuestionCard: React.FC<IntegrationCardProps> = ({ data }) => (
  <div className="integration-card devin-card">
    <DevinHeader title="Devin asks" />
    <div className="card-body">
      <strong className="devin-title">{data.question}</strong>
      <ol className="devin-list">
        {data.options?.map((option: any) => (
          <li key={option.label} className="devin-option">
            <span className="devin-index">{option.label}</span>
            <span>{option.text}</span>
            {data.recommendation?.label === option.label && (
              <span className="badge devin-badge devin-recommended">
                Recommended
              </span>
            )}
          </li>
        ))}
      </ol>
      {data.recommendation?.reason && (
        <span className="devin-muted">{data.recommendation.reason}</span>
      )}
    </div>
    <div className="card-footer">
      <DevinOpenLink url={data.url} />
    </div>
  </div>
);

const DevinConfirmCard: React.FC<IntegrationCardProps> = ({ data }) => (
  <div className="integration-card devin-card devin-confirm">
    <DevinHeader
      title={data.action === "stop" ? "Stop session?" : "Start session?"}
    >
      <span className="badge devin-badge">Waiting for your yes</span>
    </DevinHeader>
    <div className="card-body">
      <span>{data.readBack}</span>
    </div>
  </div>
);

const DEVIN_RENDERERS: Record<string, React.FC<IntegrationCardProps>> = {
  session: DevinSessionCard,
  list: DevinSessionListCard,
  reading: DevinReadingCard,
  question: DevinQuestionCard,
  confirm: DevinConfirmCard,
};

const DevinCard: React.FC<IntegrationCardProps> = ({ data }) => {
  const Renderer = DEVIN_RENDERERS[data?.kind] || DefaultIntegrationCard;
  return <Renderer data={data} />;
};

const INTEGRATION_RENDERERS: Record<string, React.FC<IntegrationCardProps>> = {
  spotify: SpotifyCard,
  notion: NotionCard,
  search: SearchCard,
  devin: DevinCard,
};

export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  isThinking,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const renderIntegrationCard = (type: string, data: any) => {
    const Renderer = INTEGRATION_RENDERERS[type] || DefaultIntegrationCard;
    return <Renderer data={data} />;
  };

  return (
    <div className="chat-window-container" ref={containerRef}>
      {messages.length === 0 ? (
        <div className="chat-empty-state">
          <p>No messages yet. Send a message or start speaking to begin.</p>
        </div>
      ) : (
        <div className="chat-messages-list">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-message-item ${msg.sender === "user" ? "user" : "puding"} ${
                msg.isStreaming ? "streaming" : ""
              }`}
            >
              <div className="chat-message-bubble">
                <div className="chat-message-sender">
                  {msg.sender === "user" ? "You" : "Puding"}
                </div>
                <div className="chat-message-text">
                  {msg.text}
                  {msg.isStreaming && (
                    <span className="streaming-cursor">|</span>
                  )}
                </div>
                {msg.integration && (
                  <div className="chat-message-integration">
                    {renderIntegrationCard(
                      msg.integration.type,
                      msg.integration.data,
                    )}
                  </div>
                )}
                <div className="chat-message-time">{msg.timestamp}</div>
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="chat-message-item puding thinking">
              <div className="chat-message-bubble">
                <div className="chat-message-sender">Puding</div>
                <div className="chat-message-text thinking-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
