import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

/** Creates a 256-bit random token encoded for use in URLs and cookies. */
export function generateSecureToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Hashes opaque, high-entropy tokens before they are stored. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Compares a token with its stored SHA-256 hex digest without a timing leak. */
export function verifyTokenHash(token: string, expectedHash: string): boolean {
  if (!SHA256_HEX_PATTERN.test(expectedHash)) {
    return false;
  }

  const actualDigest = createHash("sha256").update(token, "utf8").digest();
  const expectedDigest = Buffer.from(expectedHash, "hex");

  return timingSafeEqual(actualDigest, expectedDigest);
}
