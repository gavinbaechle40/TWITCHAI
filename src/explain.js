export function confidenceLabel(score) {
  if (score >= 0.9) return "high confidence";
  if (score >= 0.72) return "good confidence";
  if (score >= 0.55) return "medium confidence";
  return "low confidence";
}

export function trimWords(text, maxWords = 18) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}

export function formatReason(metaEval) {
  if (!metaEval) return "not enough context yet";
  const bits = [];
  if (metaEval.ammoMeta?.tier) bits.push(`ammo ${metaEval.ammoMeta.tier}`);
  if (metaEval.weaponMeta?.tier) bits.push(`weapon ${metaEval.weaponMeta.tier}`);
  if (metaEval.enemyTier) bits.push(`enemy T${metaEval.enemyTier}`);
  if (metaEval.learningSummary) bits.push(metaEval.learningSummary);
  return bits.join(" | ");
}
