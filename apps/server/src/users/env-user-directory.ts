import {
  GoogleProfile,
  NewUserDefaults,
  PudingUser,
  UserDirectory,
} from "./user-directory";

export const LOCAL_USER: Readonly<PudingUser> = Object.freeze({
  id: "local",
  email: "local@puding.dev",
  name: "Local developer",
  role: "admin",
  status: "approved",
});

/** Without a database, everyone is the single approved `local` admin. */
export class EnvUserDirectory extends UserDirectory {
  public async findById(id: string): Promise<PudingUser | null> {
    return id === LOCAL_USER.id ? { ...LOCAL_USER } : null;
  }

  public async findByEmail(email: string): Promise<PudingUser | null> {
    return email.toLowerCase() === LOCAL_USER.email ? { ...LOCAL_USER } : null;
  }

  public async upsertFromGoogle(
    _profile: GoogleProfile,
    _defaults: NewUserDefaults,
  ): Promise<PudingUser> {
    return { ...LOCAL_USER };
  }
}
