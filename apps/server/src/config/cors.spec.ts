import { isAllowedOrigin } from "./cors";

describe("isAllowedOrigin", () => {
  const origins = ["https://puding.ofekshlinger.com", "http://localhost:6600"];

  it("allows configured origins and puding-web previews", () => {
    expect(isAllowedOrigin("https://puding.ofekshlinger.com", origins)).toBe(
      true,
    );
    expect(isAllowedOrigin("http://localhost:6600", origins)).toBe(true);
    expect(
      isAllowedOrigin(
        "https://puding-web-git-feature-x-shlin.vercel.app",
        origins,
      ),
    ).toBe(true);
  });

  it("rejects other origins", () => {
    expect(isAllowedOrigin("https://evil.example.com", origins)).toBe(false);
    expect(isAllowedOrigin("https://other-app-shlin.vercel.app", origins)).toBe(
      false,
    );
    expect(
      isAllowedOrigin("http://puding-web-x-shlin.vercel.app", origins),
    ).toBe(false);
  });
});
