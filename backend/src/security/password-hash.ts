import * as argon2 from "argon2";
import { validatePassword } from "./password-policy.js";

const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
} as const;

const PASSWORD_HASH_PATTERN =
  /^\$argon2id\$v=19\$m=65536,p=4,t=3\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/;

/** Creates a PHC-encoded Argon2id password hash. Never log the input. */
export async function hashPassword(password: string): Promise<string> {
  const validation = validatePassword(password);
  if (!validation.valid) {
    throw new TypeError(`Password rejected: ${validation.reason}`);
  }

  return argon2.hash(password, PASSWORD_HASH_OPTIONS);
}

/**
 * Verifies a password against hashes generated with the current parameters.
 * Malformed or unsupported encodings are treated as a failed verification.
 */
export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  if (!PASSWORD_HASH_PATTERN.test(encodedHash)) {
    return false;
  }

  try {
    return await argon2.verify(encodedHash, password);
  } catch {
    return false;
  }
}
