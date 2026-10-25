"use client";

import React from "react";
import { useMe } from "../hooks/useMe";
import { AccessRequestScreen } from "./AccessRequestScreen";
import { InviteOnlyScreen } from "./InviteOnlyScreen";
import { SignedInUser } from "./UserMenu";
import { VoiceApp } from "./VoiceApp";

/**
 * Shows the voice app to approved users and the request / invite-only
 * screens to everyone else. Until `/me` answers (the backend may be waking),
 * the voice app is shown and the server still turns away unapproved sockets.
 */
export function AccountGate({ user }: { user: SignedInUser }) {
  const { me, setMe, refresh } = useMe();

  if (me?.status === "pending") {
    return (
      <AccessRequestScreen
        user={user}
        me={me}
        onUpdated={setMe}
        onRefresh={refresh}
      />
    );
  }
  if (me?.status === "rejected") return <InviteOnlyScreen user={user} />;

  return (
    <VoiceApp
      user={user}
      isAdmin={me?.role === "admin"}
      pendingRequests={me?.pendingRequests}
      onAccessDenied={refresh}
    />
  );
}
