import React, { useState } from "react";
import { ConnectionStatus } from "../hooks/useLiveSession";

interface ChatInputProps {
  status: ConnectionStatus;
  onSendMessage: (text: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ status, onSendMessage }) => {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText("");
  };

  const isDisabled = status !== "connected";

  return (
    <form onSubmit={handleSubmit} className="chat-input-form">
      <div className="chat-input-container">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isDisabled ? "Connect to start chatting..." : "Type a message..."}
          disabled={isDisabled}
          className="chat-input-field"
        />
        <button
          type="submit"
          disabled={isDisabled || !text.trim()}
          className="chat-send-btn"
          aria-label="Send message"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </form>
  );
};
