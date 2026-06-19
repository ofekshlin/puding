import React, { useEffect, useRef } from "react";

interface LogConsoleProps {
  logs: string[];
}

export const LogConsole: React.FC<LogConsoleProps> = ({ logs }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Automatically scroll console log container to bottom on update
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="logs-window" ref={containerRef}>
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
  );
};
