import { useState, useRef, useEffect, useCallback } from "react";
import { useAudioRecorder } from "./useAudioRecorder";
import { useAudioPlayer } from "./useAudioPlayer";
import { resolveWsUrl } from "../lib/backendUrl";
import {
  readAccessToken,
  storeAccessToken,
  withAccessToken,
  UNAUTHORIZED_CLOSE_CODE,
} from "../lib/accessToken";
import { fetchPudingToken } from "../lib/pudingToken";
import { signOutOfPuding } from "../app/actions";

export type ConnectionStatus =
  "disconnected" | "connecting" | "waking" | "connected" | "failed";

// A free-tier Render instance that has spun down takes ~30-50s to answer, so
// a handshake still pending after this long is reported as a cold start.
const WAKING_NOTICE_MS = 4000;

/** Why a signed-in user was turned away; `invalid` means the server did not accept the sign-in. */
export type AccessDeniedReason = "pending" | "rejected" | "invalid";

export interface UseLiveSessionOptions {
  /** Google sign-in is on, so each connect uses a fresh Puding token. */
  authEnabled?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "puding" | "system";
  text: string;
  timestamp: string;
  isStreaming?: boolean;
  integration?: {
    type: string; // e.g. "spotify", "notion"
    data: any;
  };
}

export interface UseLiveSessionResult {
  status: ConnectionStatus;
  logs: string[];
  isRecording: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  messages: ChatMessage[];
  isThinking: boolean;
  accessTokenRequired: boolean;
  accessDenied: AccessDeniedReason | null;
  submitAccessToken: (token: string) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleRecording: () => Promise<void>;
  addLog: (msg: string) => void;
  sendTextMessage: (text: string) => void;
}

export function useLiveSession({
  authEnabled = false,
}: UseLiveSessionOptions = {}): UseLiveSessionResult {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [logs, setLogs] = useState<string[]>(["System ready."]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [accessTokenRequired, setAccessTokenRequired] =
    useState<boolean>(false);
  const [accessDenied, setAccessDenied] = useState<AccessDeniedReason | null>(
    null,
  );
  const expiredRetriesRef = useRef(0);
  const connectRef = useRef<() => Promise<void>>();
  const wsRef = useRef<WebSocket | null>(null);
  const wakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectOnFocusRef = useRef(false);

  const clearWakingTimer = useCallback(() => {
    if (wakingTimerRef.current) {
      clearTimeout(wakingTimerRef.current);
      wakingTimerRef.current = null;
    }
  }, []);

  const {
    playChunk,
    stop: stopPlayback,
    initPlayer,
    isSpeaking,
  } = useAudioPlayer();

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [
      ...prev.slice(-15),
      `${new Date().toLocaleTimeString()}: ${msg}`,
    ]);
  }, []);

  const handleAudioData = useCallback((pcmBuffer: ArrayBuffer) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(pcmBuffer);
    }
  }, []);

  const { isRecording, startRecording, stopRecording, audioLevel } =
    useAudioRecorder(handleAudioData);

  const connect = useCallback(async () => {
    initPlayer();
    setStatus("connecting");
    setMessages([]);
    setIsThinking(false);
    setAccessDenied(null);

    let token: string | null;
    let wsUrl: string;
    try {
      if (authEnabled) {
        const result = await fetchPudingToken();
        if (result.kind === "signed_out") {
          window.location.assign("/signin");
          return;
        }
        token = result.kind === "token" ? result.token : null;
      } else {
        token = readAccessToken();
      }
      wsUrl = await resolveWsUrl();
    } catch (err) {
      setStatus("failed");
      addLog(`Could not prepare the connection: ${err}`);
      return;
    }
    addLog(`Connecting to WebSocket proxy at ${wsUrl}...`);

    const ws = new WebSocket(withAccessToken(wsUrl, token));
    wsRef.current = ws;

    clearWakingTimer();
    wakingTimerRef.current = setTimeout(() => {
      setStatus((prev) => (prev === "connecting" ? "waking" : prev));
      addLog("Backend is cold, waiting for it to wake up...");
    }, WAKING_NOTICE_MS);

    let rejected = false;
    let rejectReason: string | undefined;
    let connectionsChanged = false;
    let accountDeleted = false;

    ws.onopen = () => {
      clearWakingTimer();
      setStatus("connected");
      addLog("Connected to proxy. Initializing Gemini Live session...");

      const setupMsg = {
        type: "setup",
        config: {
          model: "models/gemini-3.1-flash-live-preview",
          generationConfig: {
            responseModalities: ["AUDIO"],
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            "You are Puding, an ultra-low-latency voice assistant. Respond briefly.",
        },
      };
      ws.send(JSON.stringify(setupMsg));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "unauthorized") {
          rejected = true;
          rejectReason = msg.reason;
        } else if (msg.type === "connections_changed") {
          connectionsChanged = true;
        } else if (msg.type === "account_deleted") {
          accountDeleted = true;
        } else if (msg.type === "too_many_sessions") {
          addLog(
            `You already have ${msg.limit} Puding sessions open. Close one and try again.`,
          );
        } else if (msg.type === "setup_complete") {
          expiredRetriesRef.current = 0;
          addLog("Gemini setup complete. Start talking!");
        } else if (msg.type === "content") {
          if (msg.userTranscription) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.sender === "user" && last.isStreaming) {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...last,
                  text: last.text + msg.userTranscription,
                };
                return updated;
              }
              return [
                ...prev,
                {
                  id:
                    typeof crypto !== "undefined" && crypto.randomUUID
                      ? crypto.randomUUID()
                      : Math.random().toString(36).substring(2, 9),
                  sender: "user",
                  text: msg.userTranscription || "",
                  timestamp: new Date().toLocaleTimeString(),
                  isStreaming: true,
                },
              ];
            });
          }

          if (msg.text) {
            setMessages((prev) => {
              const list = [...prev];
              const last = list[list.length - 1];
              if (last && last.sender === "user" && last.isStreaming) {
                list[list.length - 1] = { ...last, isStreaming: false };
              }

              const newLast = list[list.length - 1];
              if (
                newLast &&
                newLast.sender === "puding" &&
                newLast.isStreaming
              ) {
                list[list.length - 1] = {
                  ...newLast,
                  text: newLast.text + msg.text,
                };
                return list;
              }

              return [
                ...list,
                {
                  id:
                    typeof crypto !== "undefined" && crypto.randomUUID
                      ? crypto.randomUUID()
                      : Math.random().toString(36).substring(2, 9),
                  sender: "puding",
                  text: msg.text || "",
                  timestamp: new Date().toLocaleTimeString(),
                  isStreaming: true,
                },
              ];
            });
          }

          if (msg.audio) {
            playChunk(msg.audio);
          }

          if (msg.integration) {
            setMessages((prev) => [
              ...prev,
              {
                id:
                  typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : Math.random().toString(36).substring(2, 9),
                sender: "puding",
                text: "",
                timestamp: new Date().toLocaleTimeString(),
                integration: msg.integration,
              },
            ]);
          }

          if (msg.turnComplete) {
            setMessages((prev) =>
              prev.map((m) =>
                m.isStreaming ? { ...m, isStreaming: false } : m,
              ),
            );
            setIsThinking(false);
          }
        } else if (msg.type === "interrupted") {
          addLog("Gemini interrupted.");
          stopPlayback();
          setMessages((prev) =>
            prev.map((m) => {
              if (m.isStreaming) {
                if (m.sender === "puding") {
                  return {
                    ...m,
                    text: m.text + " [interrupted]",
                    isStreaming: false,
                  };
                }
                return { ...m, isStreaming: false };
              }
              return m;
            }),
          );
          setIsThinking(false);
        }
      } catch (err) {
        addLog(`Error parsing message: ${err}`);
      }
    };

    ws.onclose = (event) => {
      clearWakingTimer();
      setStatus("disconnected");
      if (accountDeleted) {
        addLog("This account was deleted. Signing out...");
        void signOutOfPuding();
      } else if (connectionsChanged && document.hidden) {
        addLog(
          "Your connected services changed; reconnecting when you return.",
        );
        reconnectOnFocusRef.current = true;
      } else if (connectionsChanged) {
        addLog("Your connected services changed, reconnecting...");
        void connectRef.current?.();
      } else if (
        authEnabled &&
        rejectReason === "expired" &&
        expiredRetriesRef.current < 1
      ) {
        expiredRetriesRef.current += 1;
        addLog("Sign-in token expired, reconnecting...");
        void connectRef.current?.();
      } else if (
        authEnabled &&
        (event.code === UNAUTHORIZED_CLOSE_CODE || rejected)
      ) {
        setAccessDenied(
          rejectReason === "pending" || rejectReason === "rejected"
            ? rejectReason
            : "invalid",
        );
        addLog(
          `Server turned the session away (${rejectReason ?? "unknown"}).`,
        );
      } else if (event.code === UNAUTHORIZED_CLOSE_CODE || rejected) {
        setAccessTokenRequired(true);
        addLog("Server rejected the access token.");
      } else {
        addLog("Connection closed.");
      }
      stopRecording();
      stopPlayback();
      setIsThinking(false);
    };

    ws.onerror = (err) => {
      clearWakingTimer();
      setStatus("failed");
      addLog("WebSocket connection error.");
      console.error(err);
      setIsThinking(false);
    };
  }, [
    authEnabled,
    addLog,
    stopRecording,
    playChunk,
    stopPlayback,
    initPlayer,
    clearWakingTimer,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // A session closed by a Settings change in another tab picks up the new
  // tools when the user comes back to this one.
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden || !reconnectOnFocusRef.current) return;
      reconnectOnFocusRef.current = false;
      void connectRef.current?.();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const disconnect = useCallback(() => {
    reconnectOnFocusRef.current = false;
    clearWakingTimer();
    stopPlayback();
    setIsThinking(false);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [stopPlayback, clearWakingTimer]);

  const submitAccessToken = useCallback(
    (token: string) => {
      storeAccessToken(token);
      setAccessTokenRequired(false);
      void connect();
    },
    [connect],
  );

  const sendTextMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      stopPlayback();

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const payload = {
          type: "client_content",
          content: {
            turns: [
              {
                role: "user",
                parts: [{ text }],
              },
            ],
            turnComplete: true,
          },
        };
        wsRef.current.send(JSON.stringify(payload));
      }

      setMessages((prev) => [
        ...prev,
        {
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : Math.random().toString(36).substring(2, 9),
          sender: "user",
          text,
          timestamp: new Date().toLocaleTimeString(),
          isStreaming: false,
        },
      ]);

      setIsThinking(true);
    },
    [stopPlayback],
  );

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording();
      addLog("Stopped recording.");
    } else {
      try {
        stopPlayback();
        await startRecording();
        addLog("Mic active. Recording...");
      } catch (err) {
        addLog("Permission denied or microphone error.");
      }
    }
  }, [isRecording, startRecording, stopRecording, addLog, stopPlayback]);

  useEffect(() => {
    return () => {
      clearWakingTimer();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [clearWakingTimer]);

  return {
    status,
    logs,
    isRecording,
    isSpeaking,
    audioLevel,
    messages,
    isThinking,
    accessTokenRequired,
    accessDenied,
    submitAccessToken,
    connect,
    disconnect,
    toggleRecording,
    addLog,
    sendTextMessage,
  };
}
