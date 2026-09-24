"use client";

import React from "react";
import { useLiveSession } from "../hooks/useLiveSession";
import { VisualizerOrb } from "../components/VisualizerOrb";
import { StatusIndicator } from "../components/StatusIndicator";
import { ControlPanel } from "../components/ControlPanel";
import { ChatWindow } from "../components/ChatWindow";
import { ChatInput } from "../components/ChatInput";

export default function Home() {
  const {
    status,
    isRecording,
    isSpeaking,
    audioLevel,
    messages,
    isThinking,
    connect,
    disconnect,
    toggleRecording,
    sendTextMessage,
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
          disabled={status === "connecting" || status === "waking"}
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
      </main>
    </div>
  );
}
