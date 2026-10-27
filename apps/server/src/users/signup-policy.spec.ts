import { ConfigService, SignupMode } from "../config/config.service";
import { SignupPolicy } from "./signup-policy";
import { PudingUser } from "./user-directory";

const policy = (mode: SignupMode) =>
  new SignupPolicy({
    getSignupMode: () => mode,
    getAdminEmails: () => ["owner@x.dev"],
    getAllowedEmails: () => ["friend@x.dev"],
  } as unknown as ConfigService);

const user = (overrides: Partial<PudingUser>): PudingUser => ({
  id: "u1",
  email: "friend@x.dev",
  role: "user",
  status: "pending",
  ...overrides,
});

describe("SignupPolicy", () => {
  it.each<[SignupMode, string, string, string]>([
    ["allowlist", "Owner@X.dev", "admin", "approved"],
    ["allowlist", "FRIEND@x.dev", "user", "approved"],
    ["allowlist", "stranger@x.dev", "user", "rejected"],
    ["request", "owner@x.dev", "admin", "approved"],
    ["request", "friend@x.dev", "user", "pending"],
    ["request", "stranger@x.dev", "user", "pending"],
    ["open", "owner@x.dev", "admin", "approved"],
    ["open", "stranger@x.dev", "user", "approved"],
  ])("%s mode admits %s as %s/%s", (mode, email, role, status) => {
    expect(policy(mode).defaultsFor(email)).toEqual({ role, status });
  });

  it("always promotes ADMIN_EMAILS accounts", () => {
    expect(
      policy("request").reconcile(
        user({ email: "owner@x.dev", status: "rejected" }),
      ),
    ).toEqual({ role: "admin", status: "approved" });
    expect(
      policy("open").reconcile(
        user({ email: "owner@x.dev", role: "admin", status: "approved" }),
      ),
    ).toBeNull();
  });

  it("approves emails added to ALLOWED_EMAILS later, unless an admin decided", () => {
    const allowlist = policy("allowlist");
    expect(allowlist.reconcile(user({ status: "rejected" }))).toEqual({
      role: "user",
      status: "approved",
    });
    expect(
      allowlist.reconcile(
        user({ status: "rejected", decidedAt: "2026-10-22T00:00:00Z" }),
      ),
    ).toBeNull();
    expect(policy("request").reconcile(user({}))).toBeNull();
  });

  it("keeps stored status when the mode changes", () => {
    expect(
      policy("allowlist").reconcile(
        user({ email: "x@x.dev", status: "approved" }),
      ),
    ).toBeNull();
  });
});
