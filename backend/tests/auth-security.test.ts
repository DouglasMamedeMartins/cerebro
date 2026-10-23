import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateSecureToken,
  hashToken,
  verifyTokenHash,
} from "../src/security/auth-token.js";
import {
  DEFAULT_PASSWORD_POLICY,
  validatePassword,
} from "../src/security/password-policy.js";
import {
  hashPassword,
  verifyPassword,
} from "../src/security/password-hash.js";

test("gera tokens opacos com entropia e formato esperados", () => {
  const firstToken = generateSecureToken();
  const secondToken = generateSecureToken();

  assert.match(firstToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(firstToken, secondToken);
});

test("hashes de token são SHA-256 estáveis e verificáveis", () => {
  const token = generateSecureToken();
  const digest = hashToken(token);

  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(hashToken(token), digest);
  assert.equal(verifyTokenHash(token, digest), true);
  assert.equal(verifyTokenHash("different-token", digest), false);
  assert.equal(verifyTokenHash(token, "not-a-sha256-digest"), false);
});

test("política padrão aplica mínimo documentado sem impor composição ou teto", () => {
  assert.equal(DEFAULT_PASSWORD_POLICY.minCodePoints, 12);
  assert.deepEqual(validatePassword("short"), {
    valid: false,
    reason: "PASSWORD_TOO_SHORT",
  });
  assert.deepEqual(validatePassword("a".repeat(12)), { valid: true });
  assert.deepEqual(validatePassword("a".repeat(4096)), { valid: true });
});

test("valida comprimento por pontos de código Unicode e aceita política configurada", () => {
  assert.deepEqual(validatePassword("😀".repeat(12)), { valid: true });
  assert.deepEqual(validatePassword("pass", { minCodePoints: 4 }), {
    valid: true,
  });
  assert.deepEqual(validatePassword("abc", { minCodePoints: 4 }), {
    valid: false,
    reason: "PASSWORD_TOO_SHORT",
  });
});

test("rejeita tipos inválidos e configurações inconsistentes da política", () => {
  assert.deepEqual(validatePassword(undefined), {
    valid: false,
    reason: "PASSWORD_MUST_BE_A_STRING",
  });
  assert.throws(
    () => validatePassword("valid password", { minCodePoints: 0 }),
    RangeError,
  );
});

test("hash Argon2id autentica senha correta e rejeita senha incorreta", async () => {
  const password = "correct horse battery staple";
  const encodedHash = await hashPassword(password);

  assert.match(encodedHash, /^\$argon2id\$v=19\$m=65536,p=4,t=3\$/);
  assert.equal(await verifyPassword(password, encodedHash), true);
  assert.equal(await verifyPassword("incorrect password", encodedHash), false);
  assert.equal(encodedHash.includes(password), false);
});

test("hash Argon2id usa salts distintos para a mesma senha", async () => {
  const password = "correct horse battery staple";
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword(password, secondHash), true);
});

test("verificação de hashes malformados retorna false sem lançar", async () => {
  for (const malformedHash of [
    "",
    "not-an-argon2-hash",
    "$argon2i$v=19$m=65536,t=3,p=4$invalid$invalid",
    "$argon2id$v=19$m=999999999,t=3,p=4$invalid$invalid",
    "$argon2id$v=16$m=65536,t=3,p=4$invalid$invalid",
    `$argon2id$v=19$m=65536,p=4,t=3$${"a".repeat(22)}$${"A".repeat(43)}`,
  ]) {
    assert.equal(await verifyPassword("candidate password", malformedHash), false);
  }
});

test("hashPassword recusa senha fora da política documentada", async () => {
  await assert.rejects(hashPassword("too short"), {
    name: "TypeError",
    message: "Password rejected: PASSWORD_TOO_SHORT",
  });
});
