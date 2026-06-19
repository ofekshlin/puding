"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAudioRecorder } from "../hooks/useAudioRecorder";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";

export default function Home() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [logs, setLogs] = useState<string[]>(["System ready."]);
  const wsRef = useRef<WebSocket | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev.slice(-15), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const handleAudioData = (pcmBuffer: ArrayBuffer) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(pcmBuffer);
    }
  };

  const { isRecording, startRecording, stopRecording, audioLevel } = useAudioRecorder(handleAudioData);

  const connect = () => {
    setStatus("connecting");
    addLog("Connecting to WebSocket proxy...");

    const ws = new WebSocket("ws://localhost:3001");
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      addLog("Connected to proxy. Initializing Gemini Live session...");

      // Send setup message
      const setupMsg = {
        type: "setup",
        config: {
          model: "models/gemini-3.1-flash-live-preview",
          generationConfig: {
            responseModalities: ["AUDIO"],
          },
          systemInstruction: "You are Puding, an ultra-low-latency voice assistant. Respond briefly.",
        },
      };
      ws.send(JSON.stringify(setupMsg));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "setup_complete") {
          addLog("Gemini setup complete. Start talking!");
        } else if (msg.type === "content") {
          if (msg.text) {
            addLog(`Gemini: ${msg.text}`);
          }
          if (msg.audio) {
            // Audio output chunks are received here. In Stage 1.3, we will stream them to useAudioPlayer.
            addLog(`Received response chunk (size: ${msg.audio.length})`);
          }
        } else if (msg.type === "interrupted") {
          addLog("Gemini interrupted.");
        }
      } catch (err) {
        addLog(`Error parsing message: ${err}`);
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      addLog("Connection closed.");
      stopRecording();
    };

    ws.onerror = (err) => {
      setStatus("failed");
      addLog("WebSocket connection error.");
      console.error(err);
    };
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
      addLog("Stopped recording.");
    } else {
      try {
        await startRecording();
        addLog("Mic active. Recording...");
      } catch (err) {
        addLog("Permission denied or microphone error.");
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <div className="container">
      <main className="card">
        <div className="logo-container">
          <h1 className="title">Puding 🍮</h1>
          <p className="subtitle">Real-time Multimodal Live Proxy Client</p>
        </div>

        {/* Dynamic Glowing Orb Visualizer */}
        <div className={`visualizer-orb ${isRecording ? "recording" : ""}`}>
          <button
            onClick={status === "connected" ? toggleRecording : connect}
            disabled={status === "connecting"}
            className={`orb-inner ${isRecording ? "recording" : ""}`}
            style={{
              transform: isRecording ? `scale(${1 + audioLevel / 180})` : "scale(1)",
              boxShadow: isRecording
                ? `0 0 ${20 + audioLevel / 2}px rgba(239, 68, 68, ${0.4 + audioLevel / 100})`
                : undefined,
            }}
          >
            {status !== "connected" ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3l14 9-14 9V3z"/>
              </svg>
            ) : isRecording ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
              </svg>
            )}
          </button>
        </div>

        {/* Status Indicator */}
        <div className="status-indicator">
          <span className={`status-dot ${status === "connected" ? (isRecording ? "recording" : "connected") : ""}`} />
          <span>
            {status === "connected"
              ? isRecording
                ? `Streaming Audio (Level: ${audioLevel})`
                : "Connected & Ready"
              : status === "connecting"
              ? "Connecting to Proxy..."
              : "Agent Disconnected"}
          </span>
        </div>

        {/* Control Actions */}
        <div style={{ display: "flex", gap: "1rem", width: "100%", justifyContent: "center" }}>
          {status !== "connected" ? (
            <button
              onClick={connect}
              disabled={status === "connecting"}
              className="btn btn-primary"
              style={{ width: "100%" }}
            >
              Connect Agent
            </button>
          ) : (
            <>
              <button
                onClick={toggleRecording}
                className={`btn ${isRecording ? "btn-secondary" : "btn-primary"}`}
                style={{ flex: 1 }}
              >
                {isRecording ? "Mute Mic" : "Unmute Mic"}
              </button>
              <button
                onClick={disconnect}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Disconnect
              </button>
            </>
          )}
        </div>

        {/* Debug Logs Console */}
        <div className="logs-window">
          {logs.map((log, idx) => {
            const isGemini = log.includes("Gemini:");
            const parts = log.split(": ");
            const time = parts[0];
            const content = parts.slice(1).join(": ");
            return (
              <div key={idx} className="log-entry">
                <span className="log-time">{time}</span>
                <span className={isGemini ? "log-gemini" : ""}>{content || log}</span>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
