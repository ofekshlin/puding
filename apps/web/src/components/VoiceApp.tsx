"use client";

import React from "react";
import { AccessDeniedReason, useLiveSession } from "../hooks/useLiveSession";
import { VisualizerOrb } from "./VisualizerOrb";
import { StatusIndicator } from "./StatusIndicator";
import { ControlPanel } from "./ControlPanel";
import { ChatWindow } from "./ChatWindow";
import { ChatInput } from "./ChatInput";
import { AccessTokenPrompt } from "./AccessTokenPrompt";
import { SignedInUser, UserMenu } from "./UserMenu";

const ACCESS_DENIED_MESSAGES: Record<AccessDeniedReason, string> = {
  pending: "Your account is waiting for approval.",
  rejected: "Puding is invite-only, and this account does not have access.",
  invalid:
    "The server did not accept your sign-in. Try signing out and in again.",
};

export interface VoiceAppProps {
  /** Set when Google sign-in is on; the legacy access token is used otherwise. */
  user?: SignedInUser;
  /** Re-checks the account when the server turns the session away. */
  onAccessDenied?: () => void;
  isAdmin?: boolean;
  pendingRequests?: number;
}

export function VoiceApp({
  user,
  onAccessDenied,
  isAdmin,
  pendingRequests,
}: VoiceAppProps) {
  const {
    status,
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
    sendTextMessage,
  } = useLiveSession({ authEnabled: Boolean(user) });

  React.useEffect(() => {
    if (accessDenied) onAccessDenied?.();
  }, [accessDenied, onAccessDenied]);

  return (
    <div className="container">
      <main className="card">
        {user && (
          <UserMenu
            user={user}
            isAdmin={isAdmin}
            pendingRequests={pendingRequests}
          />
        )}

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

        {accessDenied && (
          <p className="access-denied" role="alert">
            {ACCESS_DENIED_MESSAGES[accessDenied]}
          </p>
        )}

        {accessTokenRequired && (
          <AccessTokenPrompt onSubmit={submitAccessToken} />
        )}

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
