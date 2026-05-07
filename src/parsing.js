import { normalize } from "./utils.js";

const aliases = {
  "m4": "m4a1",
  "m4a1": "m4a1",
  "colt m4": "m4a1",
  "hk": "hk416",
  "hk416": "hk416",
  "ak": "akm",
  "ak47": "akm",
  "akm": "akm",
  "fal": "fal",
  "mp5": "mp5",
  "vecotr": "vector",
  "vector 9mm": "vector",
  "vector": "vector",
  "m995": "m995",
  "m855": "m855",
  "bp": "bp",
  "ps": "ps",
  "ap": "ap",
  "pst": "pst",
  "fmj": "fmj",
  "tv": "tv station",
  "tvs": "tv station",
  "tv station": "tv station"
};

const weaponTerms = ["m4a1","hk416","akm","fal","mp5","vector"];
const ammoTerms = ["m995","m855","bp","ps","ap","pst","fmj"];
const maps = ["tv station", "armory", "farm", "valley", "airport", "port", "northridge"];

export function canonicalize(term) {
  const n = normalize(term);
  return aliases[n] || n;
}

export function inferTier(message) {
  const m = String(message || "").match(/(?:t|tier|class)\s*([1-6])/i);
  return m ? Number(m[1]) : null;
}

export function inferMap(message) {
  const msg = normalize(message);
  return maps.find(m => msg.includes(m)) || null;
}

export function extractKnownEntities(message) {
  const msg = ` ${normalize(message)} `;
  let weapon = null;
  let ammo = null;
  let map = inferMap(message);
  let enemyTier = inferTier(message);

  for (const term of weaponTerms) {
    if (msg.includes(` ${term} `)) {
      weapon = term;
      break;
    }
  }

  for (const term of ammoTerms) {
    if (msg.includes(` ${term} `)) {
      ammo = term;
      break;
    }
  }

  // alias-based fallback
  if (!weapon || !ammo) {
    for (const [alias, canonical] of Object.entries(aliases)) {
      if (msg.includes(` ${alias} `)) {
        if (!weapon && weaponTerms.includes(canonical)) weapon = canonical;
        if (!ammo && ammoTerms.includes(canonical)) ammo = canonical;
      }
    }
  }

  return { weapon, ammo, map, enemyTier };
}

export function parseSimpleCommand(prefix, message) {
  const raw = String(message || "").trim();
  if (!raw.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const content = raw.slice(prefix.length).trim();
  const [command, ...rest] = content.split(/\s+/);
  return {
    command: normalize(command),
    args: rest,
    rawArgs: rest.join(" ")
  };
}
