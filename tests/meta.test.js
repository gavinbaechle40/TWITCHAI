import test from "node:test";
import assert from "node:assert/strict";
import { buildClusterKey } from "../src/learningClusters.js";

test("cluster key groups similar scenarios", () => {
  const a = buildClusterKey({ weaponTerm: "mp5 ap", ammoTerm: "ap", enemyTier: 5, map: "TV Station" });
  const b = buildClusterKey({ weaponTerm: "vector ap", ammoTerm: "ap", enemyTier: 5, map: "Armory" });
  assert.equal(a, b);
});
