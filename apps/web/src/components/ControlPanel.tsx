import React from "react";
import { ConnectionStatus } from "../hooks/useLiveSession";

interface ControlPanelProps {
  status: ConnectionStatus;
  isRecording: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleRecording: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  status,
  isRecording,
  onConnect,
  onDisconnect,
  onToggleRecording,
}) => {
  const isConnecting = status === "connecting";
  const isConnected = status === "connected";

  if (!isConnected) {
    return (
      <div style={{ width: "100%" }}>
        <button
          onClick={onConnect}
          disabled={isConnecting}
          className="btn btn-primary"
          style={{ width: "100%" }}
        >
          {isConnecting ? "Connecting..." : "Connect Agent"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "1rem", width: "100%", justifyContent: "center" }}>
      <button
        onClick={onToggleRecording}
        className={`btn ${isRecording ? "btn-secondary" : "btn-primary"}`}
        style={{ flex: 1 }}
      >
        {isRecording ? "Mute Mic" : "Unmute Mic"}
      </button>
      <button onClick={onDisconnect} className="btn btn-secondary" style={{ flex: 1 }}>
        Disconnect
      </button>
    </div>
  );
};
