import React from "react";
import { SignedInUser, UserMenu } from "./UserMenu";

/** Shown to rejected (or revoked) accounts. */
export function InviteOnlyScreen({ user }: { user: SignedInUser }) {
  return (
    <div className="container">
      <main className="card account-screen">
        <UserMenu user={user} />
        <header className="logo-container">
          <h1 className="title">Puding 🍮</h1>
          <p className="subtitle">Invite only</p>
        </header>
        <p className="account-text">
          Puding is invite-only, and {user.email ?? "this account"} doesn&apos;t
          have access. Sign out to try a different Google account.
        </p>
      </main>
    </div>
  );
}
