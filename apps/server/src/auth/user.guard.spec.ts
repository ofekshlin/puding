import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { LOCAL_USER } from "../users/env-user-directory";
import { AuthService } from "./auth.service";
import { AllowPending, UserGuard } from "./user.guard";

class Routes {
  plain() {}

  @AllowPending()
  pending() {}

  @AllowPending({ rejected: true })
  me() {}
}

function contextFor(route: keyof Routes, authorization?: string) {
  const req: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => Routes.prototype[route],
    getClass: () => Routes,
  } as unknown as ExecutionContext;
  return { req, ctx };
}

describe("UserGuard", () => {
  const authenticate = jest.fn();
  const guard = new UserGuard(
    { authenticate } as unknown as AuthService,
    new Reflector(),
  );

  beforeEach(() => authenticate.mockReset());

  it("passes the bearer token and attaches the user", async () => {
    authenticate.mockResolvedValue({ ok: true, user: LOCAL_USER });
    const { req, ctx } = contextFor("plain", "Bearer abc.def");

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(authenticate).toHaveBeenCalledWith("abc.def", ["approved"]);
    expect(req.user).toEqual(LOCAL_USER);
  });

  it.each<[keyof Routes, string[]]>([
    ["plain", ["approved"]],
    ["pending", ["approved", "pending"]],
    ["me", ["approved", "pending", "rejected"]],
  ])("route %s admits %p", async (route, allowed) => {
    authenticate.mockResolvedValue({ ok: true, user: LOCAL_USER });
    await guard.canActivate(contextFor(route, "Bearer t").ctx);
    expect(authenticate).toHaveBeenCalledWith("t", allowed);
  });

  it("answers 401 for a missing or bad token", async () => {
    authenticate.mockResolvedValue({ ok: false, reason: "missing" });
    const { ctx } = contextFor("plain", "Basic nope");
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(authenticate).toHaveBeenCalledWith(null, ["approved"]);
  });

  it("answers 403 with the reason for pending and rejected users", async () => {
    authenticate.mockResolvedValue({ ok: false, reason: "pending" });
    const error = await guard
      .canActivate(contextFor("plain", "Bearer t").ctx)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      reason: "pending",
    });
  });
});
