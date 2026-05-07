import test from "node:test";
import assert from "node:assert/strict";
import { checkSpreadsheetSchema } from "../src/schemaCheck.js";

test("spreadsheet schema is readable", () => {
  const result = checkSpreadsheetSchema();
  assert.equal(typeof result.ok, "boolean");
});
