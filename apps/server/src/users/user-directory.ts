export type UserRole = "user" | "admin";
export type UserStatus = "pending" | "approved" | "rejected";

export interface PudingUser {
  id: string;
  email: string;
  name?: string;
  pictureUrl?: string;
  role: UserRole;
  status: UserStatus;
  /** Optional "who are you?" note sent with an access request. */
  requestNote?: string;
  /** ISO timestamps; set only for stored accounts. */
  requestedAt?: string;
  createdAt?: string;
  decidedAt?: string;
}

/** An access change; passing `decidedBy` records it as an admin decision. */
export interface UserAccessUpdate {
  role?: UserRole;
  status?: UserStatus;
  decidedBy?: string | null;
}

export interface GoogleProfile {
  googleSub: string;
  email: string;
  name?: string;
  pictureUrl?: string;
}

/** Role and status given to a user the first time they are seen. */
export interface NewUserDefaults {
  role: UserRole;
  status: UserStatus;
}

/** Puding accounts, injected by this abstract class (Postgres or the implicit local user). */
export abstract class UserDirectory {
  abstract findById(id: string): Promise<PudingUser | null>;

  abstract findByEmail(email: string): Promise<PudingUser | null>;

  /**
   * Returns the user for this Google identity, creating it with `defaults` on
   * first sight. Later sign-ins refresh the profile fields only.
   */
  abstract upsertFromGoogle(
    profile: GoogleProfile,
    defaults: NewUserDefaults,
  ): Promise<PudingUser>;

  /** Stored users, newest first, optionally filtered by status. */
  abstract list(status?: UserStatus): Promise<PudingUser[]>;

  /** Changes role/status; returns null when the user is not stored. */
  abstract update(
    id: string,
    patch: UserAccessUpdate,
  ): Promise<PudingUser | null>;

  /** Records an access request (with an optional note); null when not stored. */
  abstract recordAccessRequest(
    id: string,
    note: string | null,
  ): Promise<PudingUser | null>;

  /** Deletes the account and (by cascade) its connections; false when not stored. */
  abstract delete(id: string): Promise<boolean>;
}
