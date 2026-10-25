import { Inject, Injectable } from "@nestjs/common";
import { ConfigService, SignupMode } from "../config/config.service";
import { NewUserDefaults, PudingUser } from "./user-directory";

/**
 * Decides how a Google account is admitted under `SIGNUP_MODE`. Status is
 * stored, so a mode change never locks out someone already approved.
 */
@Injectable()
export class SignupPolicy {
  private readonly mode: SignupMode;
  private readonly admins: Set<string>;
  private readonly allowed: Set<string>;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.mode = config.getSignupMode();
    this.admins = new Set(config.getAdminEmails());
    this.allowed = new Set(config.getAllowedEmails());
  }

  public getMode(): SignupMode {
    return this.mode;
  }

  public isAdminEmail(email: string): boolean {
    return this.admins.has(email.toLowerCase());
  }

  /** Role and status for an account seen for the first time. */
  public defaultsFor(email: string): NewUserDefaults {
    if (this.isAdminEmail(email)) return { role: "admin", status: "approved" };
    switch (this.mode) {
      case "open":
        return { role: "user", status: "approved" };
      case "allowlist":
        return {
          role: "user",
          status: this.allowed.has(email.toLowerCase())
            ? "approved"
            : "rejected",
        };
      default:
        return { role: "user", status: "pending" };
    }
  }

  /**
   * The access a stored user should be moved to, or null. `ADMIN_EMAILS` always
   * wins; an email added to `ALLOWED_EMAILS` later is approved unless an admin
   * already decided otherwise.
   */
  public reconcile(user: PudingUser): NewUserDefaults | null {
    if (this.isAdminEmail(user.email)) {
      return user.role === "admin" && user.status === "approved"
        ? null
        : { role: "admin", status: "approved" };
    }
    if (
      this.mode === "allowlist" &&
      this.allowed.has(user.email.toLowerCase()) &&
      user.status !== "approved" &&
      !user.decidedAt
    ) {
      return { role: user.role, status: "approved" };
    }
    return null;
  }
}
