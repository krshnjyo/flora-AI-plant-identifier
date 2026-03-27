import test from "node:test";
import assert from "node:assert/strict";

import { hasSecureJwtSecret, hasValidDatabaseUrl } from "../lib/env.ts";

test("hasValidDatabaseUrl accepts postgres connection strings", () => {
  assert.equal(hasValidDatabaseUrl("postgresql://flora:secret@db.example.com:5432/flora?sslmode=require"), true);
  assert.equal(hasValidDatabaseUrl("postgres://flora:secret@db.example.com/flora"), true);
});

test("hasValidDatabaseUrl rejects missing or non-postgres connection strings", () => {
  assert.equal(hasValidDatabaseUrl(""), false);
  assert.equal(hasValidDatabaseUrl("mysql://flora:secret@db.example.com/flora"), false);
  assert.equal(hasValidDatabaseUrl("postgresql://db.example.com"), false);
});

test("hasSecureJwtSecret rejects placeholders and accepts long unique secrets", () => {
  assert.equal(hasSecureJwtSecret("changeme"), false);
  assert.equal(hasSecureJwtSecret("12345678901234567890123456789012"), true);
});
