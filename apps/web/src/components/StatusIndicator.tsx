import React from "react";
import { ConnectionStatus } from "../hooks/useLiveSession";

interface StatusIndicatorProps {
  status: ConnectionStatus;
  isRecording: boolean;
  audioLevel: number;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  isRecording,
  audioLevel,
}) => {
  const getStatusText = () => {
    switch (status) {
      case "connected":
        return isRecording ? `Streaming Audio (Level: ${audioLevel})` : "Connected & Ready";
      case "connecting":
        return "Connecting to Proxy...";
      case "failed":
        return "Connection Error";
      default:
        return "Agent Disconnected";
    }
  };

  const isStateActive = status === "connected";

  return (
    <div className="status-indicator">
      <span
        className={`status-dot ${
          isStateActive ? (isRecording ? "recording" : "connected") : ""
        }`}
      />
      <span>{getStatusText()}</span>
    </div>
  );
};
