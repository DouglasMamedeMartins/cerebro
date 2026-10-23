/**
 * Password policy for candidate accounts.
 *
 * The default minimum is 12 Unicode code points. There is no application-level
 * maximum or character-composition rule, so long passphrases and password
 * managers remain usable. Bound request bodies at the HTTP layer to limit
 * resource consumption; do not trim or normalize passwords before hashing.
 */
export const DEFAULT_PASSWORD_POLICY = Object.freeze({
  minCodePoints: 12,
});

export type PasswordPolicy = {
  minCodePoints: number;
};

export type PasswordValidationResult =
  | { valid: true }
  | {
      valid: false;
      reason: "PASSWORD_MUST_BE_A_STRING" | "PASSWORD_TOO_SHORT";
    };

export function validatePassword(
  password: unknown,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): PasswordValidationResult {
  if (!Number.isSafeInteger(policy.minCodePoints) || policy.minCodePoints < 1) {
    throw new RangeError("minCodePoints must be a positive safe integer");
  }

  if (typeof password !== "string") {
    return { valid: false, reason: "PASSWORD_MUST_BE_A_STRING" };
  }

  if (Array.from(password).length < policy.minCodePoints) {
    return { valid: false, reason: "PASSWORD_TOO_SHORT" };
  }

  return { valid: true };
}
