import { getDb, lookupLocal } from "./db.js";
import { normalize } from "./utils.js";
import { buildScenarioKey, getLearningAdjustment, summarizeLearning } from "./metaLearning.js";

const EXPLICIT_META = {
  weapons: {
    "m4a1": { tier: "S", style: "all-rounder", note: "top recoil-to-performance balance" },
    "hk416": { tier: "S", style: "laser", note: "strong recoil control and flexibility" },
    "vector": { tier: "S", style: "cqb", note: "dominant close-range if ammo is good" },
    "fal": { tier: "A", style: "anti-armor", note: "hits hard but can be punishing" },
    "akm": { tier: "A", style: "budget power", note: "strong value if you can control it" },
    "mp5": { tier: "B", style: "budget cqb", note: "good close, weaker into heavier armor" }
  },
  ammo: {
    "m995": { tier: "S", penBand: 6, note: "top-tier pen" },
    "bp": { tier: "S", penBand: 5, note: "strong against higher armor" },
    "ap": { tier: "A", penBand: 4, note: "solid pen if matched to the weapon/caliber" },
    "m855": { tier: "B", penBand: 3, note: "playable budget ammo" },
    "ps": { tier: "C", penBand: 2, note: "starts struggling into heavier armor" },
    "pst": { tier: "C", penBand: 2, note: "light budget ammo" },
    "fmj": { tier: "D", penBand: 1, note: "cheap but weak into armor" }
  },
  armor: {
    "class 6": { tier: "S" },
    "tier 6": { tier: "S" },
    "t6": { tier: "S" },
    "class 5": { tier: "A" },
    "tier 5": { tier: "A" },
    "t5": { tier: "A" },
    "class 4": { tier: "B" },
    "tier 4": { tier: "B" },
    "t4": { tier: "B" },
    "class 3": { tier: "C" },
    "tier 3": { tier: "C" },
    "t3": { tier: "C" }
  }
};

function firstNumber(value) {
  const m = String(value ?? "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function getRowName(row) {
  if (!row) return "";
  for (const key of ["Name", "Item", "Ammo", "Weapon", "Armor", "Helmet", "Title"]) {
    if (row[key]) return String(row[key]);
  }
  return "";
}

function findNumeric(row, keys) {
  if (!row) return null;
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") {
      const n = firstNumber(row[k]);
      if (n !== null) return n;
    }
  }
  for (const [k, v] of Object.entries(row)) {
    const key = String(k).toLowerCase();
    if (keys.some(want => key.includes(want.toLowerCase()))) {
      const n = firstNumber(v);
      if (n !== null) return n;
    }
  }
  return null;
}

function explicitLookup(kind, term) {
  const t = normalize(term);
  const table = EXPLICIT_META[kind] || {};
  if (table[t]) return table[t];
  // partial match fallback
  for (const [key, value] of Object.entries(table)) {
    if (t.includes(key) || key.includes(t)) return value;
  }
  return null;
}

export function inferAmmoMeta(term, row = null) {
  const explicit = explicitLookup("ammo", term);
  const penetration =
    findNumeric(row, ["Pen", "Penetration", "pen", "penetration"]) ??
    explicit?.penBand !== undefined ? explicit?.penBand * 10 : null;

  let tier = explicit?.tier || "C";
  let penBand = explicit?.penBand || 0;

  if (penetration !== null) {
    if (penetration >= 50) { tier = "S"; penBand = 6; }
    else if (penetration >= 40) { tier = "A"; penBand = 5; }
    else if (penetration >= 30) { tier = "B"; penBand = 4; }
    else if (penetration >= 20) { tier = "C"; penBand = 3; }
    else if (penetration >= 10) { tier = "D"; penBand = 2; }
    else { tier = "D"; penBand = 1; }
  }

  return {
    tier,
    penBand,
    note: explicit?.note || `pen band ${penBand}`
  };
}

export function inferWeaponMeta(term, row = null) {
  const explicit = explicitLookup("weapons", term);
  const recoil =
    findNumeric(row, ["Recoil", "Vertical Recoil", "Horizontal Recoil", "recoil"]) ?? null;
  const ergonomics =
    findNumeric(row, ["Ergonomics", "ergo", "Handling"]) ?? null;

  let tier = explicit?.tier || "B";
  if (recoil !== null && ergonomics !== null) {
    const score = ergonomics - (recoil / 10);
    if (score >= 50) tier = "S";
    else if (score >= 35) tier = "A";
    else if (score >= 20) tier = "B";
    else tier = "C";
  }

  return {
    tier,
    style: explicit?.style || "general",
    note: explicit?.note || "derived from local stat shape"
  };
}

export function inferArmorMeta(term, row = null) {
  const explicit = explicitLookup("armor", term);
  const armorClass =
    findNumeric(row, ["Class", "Tier", "Armor Class", "armor", "tier"]) ?? null;

  let tier = explicit?.tier || "C";
  if (armorClass !== null) {
    if (armorClass >= 6) tier = "S";
    else if (armorClass >= 5) tier = "A";
    else if (armorClass >= 4) tier = "B";
    else if (armorClass >= 3) tier = "C";
    else tier = "D";
  }

  return { tier };
}

export function evaluateFightMeta({ weaponTerm, ammoTerm, enemyTier = null, map = null }) {
  const local = {
    weapon: weaponTerm ? lookupLocal(weaponTerm).weapon : null,
    ammo: ammoTerm ? lookupLocal(ammoTerm).ammo : null
  };

  const weaponMeta = inferWeaponMeta(weaponTerm || "", local.weapon);
  const ammoMeta = inferAmmoMeta(ammoTerm || "", local.ammo);

  const tierNum = Number(enemyTier || 0);
  let verdict = "playable";
  let score = 0;

  score += ({S:4,A:3,B:2,C:1,D:0}[weaponMeta.tier] || 1);
  score += ({S:5,A:4,B:3,C:2,D:1}[ammoMeta.tier] || 2);

  if (tierNum) {
    if (ammoMeta.penBand >= tierNum + 1) verdict = "hard meta";
    else if (ammoMeta.penBand >= tierNum) verdict = "strong";
    else if (ammoMeta.penBand + 1 >= tierNum) verdict = "risky";
    else verdict = "bad";
  } else {
    if (score >= 8) verdict = "strong";
    else if (score <= 3) verdict = "bad";
  }

  const mapLower = String(map || "").toLowerCase();
  if ((mapLower.includes("tv") || mapLower.includes("armory")) && weaponMeta.style === "cqb") {
    if (verdict === "risky") verdict = "strong";
  }

  const scenarioKey = buildScenarioKey({
    weaponTerm,
    ammoTerm,
    enemyTier: tierNum || null,
    map
  });

  const learning = getLearningAdjustment(scenarioKey);
  if (learning.adjustment >= 0.35) {
    if (verdict === "risky") verdict = "strong";
    else if (verdict === "bad") verdict = "risky";
  } else if (learning.adjustment <= -0.35) {
    if (verdict === "strong") verdict = "risky";
    else if (verdict === "risky" || verdict === "playable") verdict = "bad";
  }

  let reply = "";
  if (verdict === "hard meta") reply = "meta — that's a green light if you don't whiff";
  else if (verdict === "strong") reply = "pretty meta — solid setup for that fight";
  else if (verdict === "risky") reply = "not ideal — playable, but you better hit first";
  else if (verdict === "bad") reply = "not meta — that's gear donation territory";
  else reply = "playable, but not exactly top shelf";

  const learningSummary = summarizeLearning(scenarioKey);

  const baseConfidence =
    (weaponMeta.tier === "S" || weaponMeta.tier === "A" ? 0.18 : 0.08) +
    (ammoMeta.tier === "S" || ammoMeta.tier === "A" ? 0.28 : 0.14) +
    (tierNum ? 0.18 : 0.08) +
    (learning.confidence ? Math.min(0.2, learning.confidence * 0.2) : 0.05);

  const confidenceScore = Math.max(0.35, Math.min(0.97, baseConfidence + 0.25));

  return {
    verdict,
    reply,
    weaponMeta,
    ammoMeta,
    enemyTier: tierNum || null,
    scenarioKey,
    learning,
    learningSummary,
    confidenceScore
  };
}

export function getMetaSummary(term) {
  const local = lookupLocal(term);
  const parts = [];

  if (local.weapon) {
    const name = getRowName(local.weapon) || term;
    const meta = inferWeaponMeta(term, local.weapon);
    parts.push(`${name}: ${meta.tier}-tier weapon meta (${meta.note})`);
  }
  if (local.ammo) {
    const name = getRowName(local.ammo) || term;
    const meta = inferAmmoMeta(term, local.ammo);
    parts.push(`${name}: ${meta.tier}-tier ammo meta (${meta.note})`);
  }
  if (local.armor || local.helmet) {
    const row = local.armor || local.helmet;
    const name = getRowName(row) || term;
    const meta = inferArmorMeta(term, row);
    parts.push(`${name}: ${meta.tier}-tier defensive meta`);
  }

  if (!parts.length) {
    const weaponMeta = explicitLookup("weapons", term);
    const ammoMeta = explicitLookup("ammo", term);
    if (weaponMeta) parts.push(`${term}: ${weaponMeta.tier}-tier weapon meta (${weaponMeta.note})`);
    if (ammoMeta) parts.push(`${term}: ${ammoMeta.tier}-tier ammo meta (${ammoMeta.note})`);
  }

  return parts.length ? parts.join(" | ") : `I don't have a clean local meta profile for ${term} yet.`;
}
