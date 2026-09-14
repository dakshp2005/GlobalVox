import bcrypt from "bcryptjs";

// Node-runtime only (uses bcryptjs) — never import this from middleware.ts,
// which runs on the Edge runtime. Session token creation/verification in
// src/lib/auth.ts uses `jose` instead, which is Edge-compatible.

const SALT_ROUNDS = 10;

export function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
