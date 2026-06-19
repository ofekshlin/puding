import React from "react";

interface VisualizerOrbProps {
  status: string;
  isRecording: boolean;
  audioLevel: number;
  onOrbClick: () => void;
  disabled: boolean;
}

export const VisualizerOrb: React.FC<VisualizerOrbProps> = ({
  status,
  isRecording,
  audioLevel,
  onOrbClick,
  disabled,
}) => {
  return (
    <div className={`visualizer-orb ${isRecording ? "recording" : ""}`}>
      <button
        onClick={onOrbClick}
        disabled={disabled}
        className={`orb-inner ${isRecording ? "recording" : ""}`}
        style={{
          transform: isRecording ? `scale(${1 + audioLevel / 180})` : "scale(1)",
          boxShadow: isRecording
            ? `0 0 ${20 + audioLevel / 2}px rgba(239, 68, 68, ${0.4 + audioLevel / 100})`
            : undefined,
        }}
        aria-label={isRecording ? "Stop Recording" : status === "connected" ? "Start Recording" : "Connect Agent"}
      >
        {status !== "connected" ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
        ) : isRecording ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        )}
      </button>
    </div>
  );
};
