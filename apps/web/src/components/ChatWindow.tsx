import React, { useEffect, useRef } from "react";
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
    </div>
    <div className="card-body">
      <strong className="track-name">{data.track || "Unknown Track"}</strong>
      <span className="artist-name">{data.artist || "Unknown Artist"}</span>
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
      <span className="badge">Database Logged</span>
    </div>
  </div>
);

const DefaultIntegrationCard: React.FC<IntegrationCardProps> = ({ data }) => (
  <div className="integration-card default-card">
    <pre>{JSON.stringify(data, null, 2)}</pre>
  </div>
);

const INTEGRATION_RENDERERS: Record<string, React.FC<IntegrationCardProps>> = {
  spotify: SpotifyCard,
  notion: NotionCard,
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
