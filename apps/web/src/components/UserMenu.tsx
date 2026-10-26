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
  return (
    <div className="user-menu">
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
      <span className="user-menu-name" title={user.email ?? undefined}>
        {label}
      </span>
      {isAdmin && (
        <a href="/admin" className="btn btn-secondary btn-sm admin-link">
          Admin
          {pendingRequests > 0 && (
            <span
              className="badge"
              aria-label={`${pendingRequests} waiting requests`}
            >
              {pendingRequests}
            </span>
          )}
        </a>
      )}
      <form action={signOutOfPuding}>
        <button type="submit" className="btn btn-secondary btn-sm">
          Sign out
        </button>
      </form>
    </div>
  );
};
