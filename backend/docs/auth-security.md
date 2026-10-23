# Candidate authentication security components

## Password policy

The current policy helper requires at least 12 Unicode code points. It does not
impose character classes or an application-level maximum, and it does not trim
or normalize the submitted password. Request-size limits should be enforced at
the HTTP boundary before a password hashing function is called. The minimum is
configurable when calling `validatePassword`.

## Opaque tokens

`generateSecureToken` creates 32 random bytes with Node.js `crypto` and encodes
them as base64url. `hashToken` uses SHA-256 only for these high-entropy opaque
tokens, not for passwords. `verifyTokenHash` validates the stored digest format
and compares fixed-size digest bytes with `timingSafeEqual`.

## Password hashing

`hashPassword` and `verifyPassword` use the maintained `argon2` Node.js package
with Argon2id (version 19). The selected parameters are the package's documented
defaults, pinned explicitly so a package upgrade does not silently change the
format: 65,536 KiB memory cost (64 MiB), time cost 3, parallelism 4, and a
32-byte output. The package generates a random 16-byte salt for each hash and
encodes the parameters, salt, and digest in the PHC string.

These values were not tuned from a production performance benchmark. They follow
the library maintainers' documented password-hashing defaults. Benchmarking on
the deployment hardware and under expected concurrent load remains a release
readiness task; do not lower costs without an explicit security/performance
review.

Verification accepts the current Argon2id PHC encoding and current pinned cost
parameters, and treats malformed or unsupported encodings as failed
verification. If parameters are changed later, verification compatibility and
rehash behavior must be designed and tested before deployment. Hashing rejects
passwords that fail the documented password policy. Neither plaintext passwords
nor hashes are logged by these helpers.

## Scope limitation

These helpers do not create accounts, sessions, cookies, activation or reset
flows, email delivery, rate limits, or candidate authorization. Callers must
avoid logging passwords and raw tokens. Persistent storage and one-time token
consumption still need transactional implementation and tests.
