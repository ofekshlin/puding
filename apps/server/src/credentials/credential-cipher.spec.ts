import { randomBytes } from "crypto";
import {
  CredentialCipher,
  CredentialDecryptionError,
} from "./credential-cipher";

const key = () => randomBytes(32).toString("base64");
const AAD = CredentialCipher.additionalData("user-1", "notion");

describe("CredentialCipher", () => {
  it("round-trips a JSON secret with the newest key", () => {
    const cipher = new CredentialCipher(`1:${key()},2:${key()}`);
    const encrypted = cipher.encrypt({ accessToken: "ntn_secret" }, AAD);

    expect(encrypted.keyVersion).toBe(2);
    expect(encrypted.cipher.toString("utf8")).not.toContain("ntn_secret");
    expect(cipher.decrypt(encrypted, AAD)).toEqual({
      accessToken: "ntn_secret",
    });
  });

  it("uses a fresh IV for every write", () => {
    const cipher = new CredentialCipher(`1:${key()}`);
    const a = cipher.encrypt({ v: 1 }, AAD);
    const b = cipher.encrypt({ v: 1 }, AAD);
    expect(a.cipher.equals(b.cipher)).toBe(false);
    expect(a.cipher.subarray(0, 12).equals(b.cipher.subarray(0, 12))).toBe(
      false,
    );
  });

  it("rejects a ciphertext moved to another user's or provider's row", () => {
    const cipher = new CredentialCipher(`1:${key()}`);
    const encrypted = cipher.encrypt({ v: 1 }, AAD);
    expect(() =>
      cipher.decrypt(
        encrypted,
        CredentialCipher.additionalData("user-2", "notion"),
      ),
    ).toThrow(CredentialDecryptionError);
    expect(() =>
      cipher.decrypt(
        encrypted,
        CredentialCipher.additionalData("user-1", "devin"),
      ),
    ).toThrow(CredentialDecryptionError);
  });

  it("rejects tampered or truncated ciphertext", () => {
    const cipher = new CredentialCipher(`1:${key()}`);
    const encrypted = cipher.encrypt({ v: 1 }, AAD);
    const tampered = Buffer.from(encrypted.cipher);
    tampered[tampered.length - 1] ^= 0xff;

    expect(() =>
      cipher.decrypt({ ...encrypted, cipher: tampered }, AAD),
    ).toThrow(CredentialDecryptionError);
    expect(() =>
      cipher.decrypt({ ...encrypted, cipher: tampered.subarray(0, 10) }, AAD),
    ).toThrow(CredentialDecryptionError);
  });

  it("decrypts with an older key after rotation, and fails once it is removed", () => {
    const v1 = key();
    const old = new CredentialCipher(`1:${v1}`);
    const encrypted = old.encrypt({ v: 1 }, AAD);

    const rotated = new CredentialCipher(`2:${key()},1:${v1}`);
    expect(rotated.currentKeyVersion).toBe(2);
    expect(rotated.decrypt(encrypted, AAD)).toEqual({ v: 1 });

    const retired = new CredentialCipher(`2:${key()}`);
    expect(() => retired.decrypt(encrypted, AAD)).toThrow(
      /key version 1 is not configured/,
    );
  });

  it.each([
    ["", /must be set/],
    ["abc", /<version>:<base64 key>/],
    ["0:" + key(), /version from 1/],
    ["1:" + randomBytes(16).toString("base64"), /32 bytes/],
  ])("rejects key spec %p", (spec, message) => {
    expect(() => new CredentialCipher(spec)).toThrow(message);
  });

  it("rejects duplicate versions without echoing key material", () => {
    const secretKey = key();
    let error: Error | undefined;
    try {
      new CredentialCipher(`1:${secretKey},1:${key()}`);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toMatch(/more than once/);
    expect(error?.message).not.toContain(secretKey);
  });
});
