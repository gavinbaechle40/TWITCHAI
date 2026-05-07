import test from "node:test";
import assert from "node:assert/strict";
import { getVersionInfo } from "../src/version.js";

test("version info includes bot version", () => {
  const v = getVersionInfo();
  assert.ok(v.botVersion);
});
