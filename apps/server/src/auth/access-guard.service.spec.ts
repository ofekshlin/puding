import { IncomingMessage } from "http";
import { AccessGuard } from "./access-guard.service";
import { ConfigService } from "../config/config.service";

function guardWith(token: string | undefined): AccessGuard {
  const config = {
    getAccessToken: jest.fn().mockReturnValue(token),
  } as unknown as ConfigService;
  return new AccessGuard(config);
}

function request(url: string | undefined): IncomingMessage {
  return { url } as IncomingMessage;
}

describe("AccessGuard", () => {
  describe("when PUDING_ACCESS_TOKEN is unset", () => {
    const guard = guardWith(undefined);

    it("is disabled and lets every client through", () => {
      expect(guard.isEnabled()).toBe(false);
      expect(guard.isAuthorized(request("/"))).toBe(true);
      expect(guard.isAuthorized(request(undefined))).toBe(true);
    });
  });

  describe("when PUDING_ACCESS_TOKEN is set", () => {
    const guard = guardWith("s3cret-token");

    it("is enabled", () => {
      expect(guard.isEnabled()).toBe(true);
    });

    it("accepts the matching token", () => {
      expect(guard.isAuthorized(request("/?token=s3cret-token"))).toBe(true);
    });

    it("accepts a URL-encoded token alongside other parameters", () => {
      const encoded = guardWith("a b&c");
      expect(encoded.isAuthorized(request("/?x=1&token=a%20b%26c"))).toBe(true);
    });

    it("rejects a missing token", () => {
      expect(guard.isAuthorized(request("/"))).toBe(false);
      expect(guard.isAuthorized(request(undefined))).toBe(false);
      expect(guard.isAuthorized(request("/?token="))).toBe(false);
    });

    it("rejects a wrong token, including prefixes and different lengths", () => {
      expect(guard.isAuthorized(request("/?token=wrong"))).toBe(false);
      expect(guard.isAuthorized(request("/?token=s3cret"))).toBe(false);
      expect(guard.isAuthorized(request("/?token=s3cret-token-extra"))).toBe(
        false,
      );
    });
  });
});
