import test from "node:test";
import assert from "node:assert/strict";
import { deterministicFallback } from "../src/deterministic.js";

test("deterministic fallback returns stable shouldipush answer", () => {
  const reply = deterministicFallback({ command: "shouldipush", rawArgs: "mp5 ap", message: "vs t5", context: { enemyTier: 5 } });
  assert.ok(typeof reply === "string" && reply.length > 10);
});
