"use client";

import React from "react";
import { useLiveSession } from "../hooks/useLiveSession";
import { VisualizerOrb } from "../components/VisualizerOrb";
import { StatusIndicator } from "../components/StatusIndicator";
import { ControlPanel } from "../components/ControlPanel";
import { LogConsole } from "../components/LogConsole";
import { ChatWindow } from "../components/ChatWindow";
import { ChatInput } from "../components/ChatInput";

export default function Home() {
  const {
    status,
    logs,
    isRecording,
    isSpeaking,
    audioLevel,
    messages,
    isThinking,
    connect,
    disconnect,
    toggleRecording,
    sendTextMessage,
    injectMockMessage,
  } = useLiveSession();

  return (
    <div className="container">
      <main className="card">
        <header className="logo-container">
          <h1 className="title">Puding 🍮</h1>
          <p className="subtitle">Real-time Multimodal Live Proxy Client</p>
        </header>

        {/* Bouncing visualizer orb action button */}
        <VisualizerOrb
          status={status}
          isRecording={isRecording}
          isSpeaking={isSpeaking}
          audioLevel={audioLevel}
          onOrbClick={status === "connected" ? toggleRecording : connect}
          disabled={status === "connecting"}
          isThinking={isThinking}
        />

        {/* State monitoring label */}
        <StatusIndicator
          status={status}
          isRecording={isRecording}
          audioLevel={audioLevel}
        />

        {/* Connection control buttons */}
        <ControlPanel
          status={status}
          isRecording={isRecording}
          onConnect={connect}
          onDisconnect={disconnect}
          onToggleRecording={toggleRecording}
        />

        {/* Chat Window showing conversation messages & widgets */}
        <ChatWindow messages={messages} isThinking={isThinking} />

        {/* Text input to send typed messages */}
        <ChatInput status={status} onSendMessage={sendTextMessage} />

        {/* Collapsible developer console log panel */}
        <details className="dev-console-details">
          <summary className="dev-console-summary">Developer Console & Testing</summary>
          <div className="dev-console-content">
            <div className="mock-triggers">
              <span className="mock-label">Mock Integrations:</span>
              <div className="mock-btn-group">
                <button
                  onClick={() => injectMockMessage("spotify")}
                  className="btn btn-secondary btn-sm"
                  disabled={status !== "connected"}
                >
                  🎵 Spotify Player
                </button>
                <button
                  onClick={() => injectMockMessage("notion")}
                  className="btn btn-secondary btn-sm"
                  disabled={status !== "connected"}
                >
                  📝 Notion Logger
                </button>
              </div>
            </div>
            <LogConsole logs={logs} />
          </div>
        </details>
      </main>
    </div>
  );
}
