import { config } from "./config.js";
import { evaluateFightMeta, getMetaSummary } from "./meta.js";
import { inferTier } from "./parsing.js";
import { trimWords } from "./explain.js";

export function tryFastPath({ command, rawArgs, message, user, shared }) {
  if (!config.fastPathEnabled) return null;

  const map = user?.thread?.map || shared?.currentMap || null;
  const tier = inferTier(message) || user?.thread?.enemyTier || 4;

  if (command === "shouldipush") {
    const metaEval = evaluateFightMeta({
      weaponTerm: rawArgs,
      ammoTerm: rawArgs,
      enemyTier: tier,
      map
    });
    return {
      handled: true,
      text: trimWords(`${metaEval.reply} (${metaEval.weaponMeta.tier}/${metaEval.ammoMeta.tier})`, config.fastPathReplyMaxWords),
      metaEval,
      confidence: metaEval.confidenceScore ?? 0.88
    };
  }

  if (command === "meta" && rawArgs && rawArgs.split(/\s+/).length <= 4) {
    const summary = getMetaSummary(rawArgs);
    return {
      handled: true,
      text: trimWords(summary, config.fastPathReplyMaxWords),
      metaEval: null,
      confidence: 0.92
    };
  }

  if (command === "ratekit") {
    const metaEval = evaluateFightMeta({
      weaponTerm: rawArgs,
      ammoTerm: rawArgs,
      enemyTier: tier,
      map
    });
    const text = metaEval.verdict === "hard meta" || metaEval.verdict === "strong"
      ? `good kit — ${metaEval.weaponMeta.tier}/${metaEval.ammoMeta.tier} value`
      : `mid kit — ${metaEval.reply}`;
    return {
      handled: true,
      text: trimWords(text, config.fastPathReplyMaxWords),
      metaEval,
      confidence: metaEval.confidenceScore ?? 0.84
    };
  }

  return null;
}
