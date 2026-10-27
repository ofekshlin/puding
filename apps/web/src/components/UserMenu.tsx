import React from "react";
import { signOutOfPuding } from "../app/actions";

export interface SignedInUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface UserMenuProps {
  user: SignedInUser;
  /** Admins get a link to `/admin`, badged with waiting requests. */
  isAdmin?: boolean;
  pendingRequests?: number;
}

export const UserMenu: React.FC<UserMenuProps> = ({
  user,
  isAdmin,
  pendingRequests = 0,
}) => {
  const label = user.name || user.email || "Signed in";
  const badge = isAdmin && pendingRequests > 0 && (
    <span className="badge" aria-label={`${pendingRequests} waiting requests`}>
      {pendingRequests}
    </span>
  );
  return (
    <details className="user-menu">
      <summary className="user-menu-trigger" aria-label={`Account: ${label}`}>
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="user-avatar"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="user-avatar user-avatar-fallback" aria-hidden>
            {label.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="user-menu-name">{label}</span>
        {badge}
        <span className="user-menu-chevron" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="user-menu-panel">
        <div className="user-menu-identity">
          <span className="user-menu-status">Signed in as</span>
          {user.name && <strong>{user.name}</strong>}
          {user.email && <span className="user-menu-email">{user.email}</span>}
        </div>
        {isAdmin && (
          <a href="/admin" className="btn btn-secondary btn-sm admin-link">
            Admin
            {badge}
          </a>
        )}
        <form action={signOutOfPuding}>
          <button type="submit" className="btn btn-secondary btn-sm">
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
};
