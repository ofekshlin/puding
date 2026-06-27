import { useState, useRef, useEffect, useCallback } from "react";
import { useAudioRecorder } from "./useAudioRecorder";
import { useAudioPlayer } from "./useAudioPlayer";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";

export interface UseLiveSessionResult {
  status: ConnectionStatus;
  logs: string[];
  isRecording: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  connect: () => void;
  disconnect: () => void;
  toggleRecording: () => Promise<void>;
  addLog: (msg: string) => void;
}

export function useLiveSession(): UseLiveSessionResult {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [logs, setLogs] = useState<string[]>(["System ready."]);
  const wsRef = useRef<WebSocket | null>(null);

  const { playChunk, stop: stopPlayback, initPlayer, isSpeaking } = useAudioPlayer();

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-15), `${new Date().toLocaleTimeString()}: ${msg}`]);
  }, []);

  const handleAudioData = useCallback((pcmBuffer: ArrayBuffer) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(pcmBuffer);
    }
  }, []);

  const { isRecording, startRecording, stopRecording, audioLevel } = useAudioRecorder(handleAudioData);

  const connect = useCallback(() => {
    initPlayer();
    setStatus("connecting");
    addLog("Connecting to WebSocket proxy...");

    const ws = new WebSocket("ws://localhost:3001");
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      addLog("Connected to proxy. Initializing Gemini Live session...");

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
            playChunk(msg.audio);
          }
        } else if (msg.type === "interrupted") {
          addLog("Gemini interrupted.");
          stopPlayback();
        }
      } catch (err) {
        addLog(`Error parsing message: ${err}`);
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      addLog("Connection closed.");
      stopRecording();
      stopPlayback();
    };

    ws.onerror = (err) => {
      setStatus("failed");
      addLog("WebSocket connection error.");
      console.error(err);
    };
  }, [addLog, stopRecording, playChunk, stopPlayback, initPlayer]);

  const disconnect = useCallback(() => {
    stopPlayback();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [stopPlayback]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording();
      addLog("Stopped recording.");
    } else {
      try {
        // Halt any playing audio when user starts recording
        stopPlayback();
        await startRecording();
        addLog("Mic active. Recording...");
      } catch (err) {
        addLog("Permission denied or microphone error.");
      }
    }
  }, [isRecording, startRecording, stopRecording, addLog, stopPlayback]);

  // Handle cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    status,
    logs,
    isRecording,
    isSpeaking,
    audioLevel,
    connect,
    disconnect,
    toggleRecording,
    addLog,
  };
}
