import {
  GoogleProfile,
  NewUserDefaults,
  PudingUser,
  UserDirectory,
  UserStatus,
} from "./user-directory";

export const LOCAL_USER: Readonly<PudingUser> = Object.freeze({
  id: "local",
  email: "local@puding.dev",
  name: "Local developer",
  role: "admin",
  status: "approved",
});

/**
 * Without a database, admins sign in as the single `local` user that owns the
 * env credentials. Anyone else gets an unsaved account with the given defaults.
 */
export class EnvUserDirectory extends UserDirectory {
  public async findById(id: string): Promise<PudingUser | null> {
    return id === LOCAL_USER.id ? { ...LOCAL_USER } : null;
  }

  public async findByEmail(email: string): Promise<PudingUser | null> {
    return email.toLowerCase() === LOCAL_USER.email ? { ...LOCAL_USER } : null;
  }

  public async upsertFromGoogle(
    profile: GoogleProfile,
    defaults: NewUserDefaults,
  ): Promise<PudingUser> {
    if (defaults.role === "admin" && defaults.status === "approved") {
      return { ...LOCAL_USER };
    }
    return {
      id: `google:${profile.googleSub}`,
      email: profile.email.toLowerCase(),
      name: profile.name,
      pictureUrl: profile.pictureUrl,
      ...defaults,
    };
  }

  public async list(status?: UserStatus): Promise<PudingUser[]> {
    return !status || status === LOCAL_USER.status ? [{ ...LOCAL_USER }] : [];
  }

  /** Accounts other than `local` are never stored without a database. */
  public async update(): Promise<PudingUser | null> {
    return null;
  }

  public async recordAccessRequest(): Promise<PudingUser | null> {
    return null;
  }
}
