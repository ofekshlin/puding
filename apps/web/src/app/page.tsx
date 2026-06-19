"use client";

import React from "react";
import { useLiveSession } from "../hooks/useLiveSession";
import { VisualizerOrb } from "../components/VisualizerOrb";
import { StatusIndicator } from "../components/StatusIndicator";
import { ControlPanel } from "../components/ControlPanel";
import { LogConsole } from "../components/LogConsole";

export default function Home() {
  const {
    status,
    logs,
    isRecording,
    audioLevel,
    connect,
    disconnect,
    toggleRecording,
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
          audioLevel={audioLevel}
          onOrbClick={status === "connected" ? toggleRecording : connect}
          disabled={status === "connecting"}
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

        {/* Scrolling text console log panel */}
        <LogConsole logs={logs} />
      </main>
    </div>
  );
}
