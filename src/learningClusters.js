import { normalize } from "./utils.js";

function mapBucket(map) {
  const m = normalize(map);
  if (m.includes("tv") || m.includes("armory")) return "cqb";
  if (m.includes("farm") || m.includes("valley") || m.includes("airport")) return "open";
  return "general";
}

function weaponBucket(weaponTerm) {
  const w = normalize(weaponTerm);
  if (w.includes("mp5") || w.includes("vector") || w.includes("ump")) return "smg";
  if (w.includes("m4") || w.includes("hk416") || w.includes("ak")) return "rifle";
  if (w.includes("fal") || w.includes("svd") || w.includes("m14")) return "power";
  return "general";
}

function ammoBucket(ammoTerm) {
  const a = normalize(ammoTerm);
  if (a.includes("m995") || a.includes("bp") || a.includes("ap")) return "high-pen";
  if (a.includes("m855") || a.includes("ps")) return "mid-pen";
  return "low-pen";
}

export function buildClusterKey({ weaponTerm = "", ammoTerm = "", enemyTier = null, map = null }) {
  const tier = enemyTier ? `t${enemyTier}` : "t?";
  return `${weaponBucket(weaponTerm)} | ${ammoBucket(ammoTerm)} | ${tier} | ${mapBucket(map)}`;
}
