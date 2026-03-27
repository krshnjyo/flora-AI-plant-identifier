/**
 * File: backend/tests/db.test.ts
 * Purpose: Unit tests for PostgreSQL query preparation helpers.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { convertQuestionPlaceholders, preparePgQuery } from "../lib/db.ts";

test("convertQuestionPlaceholders numbers question-mark parameters in order", () => {
  const sql = "SELECT * FROM users WHERE email = ? AND role = ? LIMIT ?";
  assert.equal(convertQuestionPlaceholders(sql), "SELECT * FROM users WHERE email = $1 AND role = $2 LIMIT $3");
});

test("convertQuestionPlaceholders leaves SQL without parameters unchanged", () => {
  const sql = "SELECT user_id, email FROM users ORDER BY created_at DESC";
  assert.equal(convertQuestionPlaceholders(sql), sql);
});

test("preparePgQuery normalizes undefined params to null", () => {
  const prepared = preparePgQuery("UPDATE users SET full_name = ?, bio = ? WHERE user_id = ?", [
    "Flora User",
    undefined,
    7
  ]);

  assert.equal(prepared.text, "UPDATE users SET full_name = $1, bio = $2 WHERE user_id = $3");
  assert.deepEqual(prepared.values, ["Flora User", null, 7]);
});
