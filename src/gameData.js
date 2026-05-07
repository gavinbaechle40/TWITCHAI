const META = {
  topTierWeapons: ["U191", "H416"],
  trueOneTapWeapons: ["SJ", "M24", "Mosin"],
  closeRangeOneTapWeapons: ["SVDS", "M110"],
};

function normalize(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(q, terms) {
  return terms.some(term => q.includes(term.toLowerCase()));
}

function isAskingBestOrMeta(q) {
  return hasAny(q, [
    "best gun",
    "best guns",
    "best weapon",
    "best weapons",
    "meta",
    "top gun",
    "top guns",
    "top weapon",
    "top weapons",
    "better than any gun",
    "better than every gun",
    "strongest gun",
    "strongest weapon",
    "what should i run",
    "what gun should i use",
  ]);
}

function isAskingOneTap(q) {
  return hasAny(q, [
    "one tap",
    "1 tap",
    "onetap",
    "one shot",
    "1 shot",
    "one-shot",
    "oneshot",
    "can tap",
    "can one",
  ]);
}

export function getGameInsight(query) {
  const q = normalize(query);
  if (!q) return null;

  const mentionsU191 = q.includes("u191");
  const mentionsH416 = q.includes("h416");
  const mentionsSvdM110 = q.includes("svds") || q.includes("m110");

  if (isAskingOneTap(q)) {
    return "True 1-tap weapons are SJ, M24, and Mosin. SVDS and M110 can 1-tap within about 50 meters depending on armor, ammo, and hit placement.";
  }

  if (isAskingBestOrMeta(q)) {
    return "U191 and H416 are the top dogs right now — better than basically any gun for overall consistency. For true 1-taps: SJ, M24, and Mosin. SVDS and M110 can 1-tap inside about 50m.";
  }

  if (mentionsU191 && mentionsH416) {
    return "U191 and H416 are both S-tier. Those two are better than basically any gun for overall fights — U191 for raw pressure, H416 for clean control and consistency.";
  }

  if (mentionsU191) {
    return "U191 is S-tier and one of the best guns in the game. It is better than basically anything when you want pressure, consistency, and fight-winning power.";
  }

  if (mentionsH416) {
    return "H416 is S-tier and one of the best guns in the game. It is reliable, easy to control, and better than basically anything for clean all-around fights.";
  }

  if (mentionsSvdM110) {
    return "SVDS and M110 are nasty because they can 1-tap inside about 50 meters depending on armor, ammo, and hit placement. Past that, treat them more like heavy-hitting DMRs.";
  }

  return null;
}

export { META };
