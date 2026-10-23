import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_KEY_VERSION = 32767;

export interface EncryptedSecret {
  /** `iv (12 bytes) || auth tag (16 bytes) || ciphertext`. */
  cipher: Buffer;
  keyVersion: number;
}

export class CredentialDecryptionError extends Error {
  constructor(reason: string) {
    super(`Credential could not be decrypted: ${reason}`);
    this.name = "CredentialDecryptionError";
  }
}

/**
 * AES-256-GCM encryption for stored provider secrets.
 *
 * Keys come from `CREDENTIALS_ENCRYPTION_KEYS` as comma-separated
 * `version:base64key` entries. The highest version encrypts; every listed
 * version decrypts, so keys can be rotated without downtime. The caller's
 * additional authenticated data (`userId:provider`) binds each ciphertext to
 * its row.
 */
export class CredentialCipher {
  private readonly keys: Map<number, Buffer>;
  public readonly currentKeyVersion: number;

  constructor(keySpec: string | undefined) {
    this.keys = CredentialCipher.parseKeys(keySpec);
    this.currentKeyVersion = Math.max(...this.keys.keys());
  }

  public static additionalData(userId: string, provider: string): string {
    return `${userId}:${provider}`;
  }

  public static parseKeys(keySpec: string | undefined): Map<number, Buffer> {
    const keys = new Map<number, Buffer>();
    for (const entry of (keySpec ?? "").split(",")) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const separator = trimmed.indexOf(":");
      const versionText = separator > 0 ? trimmed.slice(0, separator) : "";
      const version = /^\d+$/.test(versionText) ? Number(versionText) : NaN;
      if (
        !Number.isInteger(version) ||
        version < 1 ||
        version > MAX_KEY_VERSION
      ) {
        throw new Error(
          `CREDENTIALS_ENCRYPTION_KEYS entries must look like "<version>:<base64 key>" with a version from 1 to ${MAX_KEY_VERSION}.`,
        );
      }
      const key = Buffer.from(trimmed.slice(separator + 1), "base64");
      if (key.length !== KEY_BYTES) {
        throw new Error(
          `CREDENTIALS_ENCRYPTION_KEYS version ${version} must decode to ${KEY_BYTES} bytes (generate one with "openssl rand -base64 32").`,
        );
      }
      if (keys.has(version)) {
        throw new Error(
          `CREDENTIALS_ENCRYPTION_KEYS lists version ${version} more than once.`,
        );
      }
      keys.set(version, key);
    }
    if (keys.size === 0) {
      throw new Error(
        "CREDENTIALS_ENCRYPTION_KEYS must be set when DATABASE_URL is set.",
      );
    }
    return keys;
  }

  public encrypt(value: unknown, additionalData: string): EncryptedSecret {
    const key = this.keys.get(this.currentKeyVersion) as Buffer;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from(additionalData, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return {
      cipher: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]),
      keyVersion: this.currentKeyVersion,
    };
  }

  public decrypt<T>(secret: EncryptedSecret, additionalData: string): T {
    const key = this.keys.get(secret.keyVersion);
    if (!key) {
      throw new CredentialDecryptionError(
        `key version ${secret.keyVersion} is not configured`,
      );
    }
    if (secret.cipher.length < IV_BYTES + TAG_BYTES) {
      throw new CredentialDecryptionError("ciphertext is truncated");
    }
    const iv = secret.cipher.subarray(0, IV_BYTES);
    const tag = secret.cipher.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = secret.cipher.subarray(IV_BYTES + TAG_BYTES);
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAAD(Buffer.from(additionalData, "utf8"));
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
      return JSON.parse(plain) as T;
    } catch {
      throw new CredentialDecryptionError(
        "authentication failed (tampered data, wrong key or wrong row)",
      );
    }
  }
}
