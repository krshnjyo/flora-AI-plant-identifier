import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSearchTerm, toSqlBooleanFullText, toSqlContainsPattern } from "../lib/search.ts";

test("normalizeSearchTerm trims, lowers, and collapses whitespace", () => {
  assert.equal(normalizeSearchTerm("  Late   Blight  "), "late blight");
});

test("normalizeSearchTerm respects max length", () => {
  assert.equal(normalizeSearchTerm("ABCDEFGHIJ", 5), "abcde");
});

test("toSqlContainsPattern escapes SQL wildcard characters", () => {
  assert.equal(toSqlContainsPattern("100%_safe\\name"), "%100\\%\\_safe\\\\name%");
});

test("toSqlBooleanFullText drops short tokens and limits the term count", () => {
  assert.equal(
    toSqlBooleanFullText("a late blight on tomato leaf sample captured in field trial"),
    "+late* +blight* +on* +tomato* +leaf* +sample* +captured* +in*"
  );
});
