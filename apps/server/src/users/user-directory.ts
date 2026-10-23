export type UserRole = "user" | "admin";
export type UserStatus = "pending" | "approved" | "rejected";

export interface PudingUser {
  id: string;
  email: string;
  name?: string;
  pictureUrl?: string;
  role: UserRole;
  status: UserStatus;
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
}
