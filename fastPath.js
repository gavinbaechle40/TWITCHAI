import { getState, ensureUser, queueSave } from "./state.js";
import { config } from "./config.js";
import { normalize } from "./utils.js";

function safeKey(v) {
  return normalize(v).replace(/\s+/g, " ").trim();
}

export function buildScenarioKey({ weaponTerm = "", ammoTerm = "", enemyTier = null, map = null }) {
  const weapon = safeKey(weaponTerm) || "unknown-weapon";
  const ammo = safeKey(ammoTerm) || "unknown-ammo";
  const tier = enemyTier ? `t${enemyTier}` : "t?";
  const mapPart = safeKey(map) || "unknown-map";
  return `${weapon} | ${ammo} | ${tier} | ${mapPart}`;
}

export function ensureLearningStore() {
  const s = getState();
  s.metaLearning = s.metaLearning || {
    scenarios: {},
    totals: {
      good: 0,
      bad: 0,
      neutral: 0
    }
  };
  return s.metaLearning;
}

export function rememberAdviceForUser(username, advice) {
  const user = ensureUser(username);
  user.pendingAdvice = {
    ...advice,
    createdAt: Date.now()
  };
  queueSave();
}

export function clearPendingAdvice(username) {
  const user = ensureUser(username);
  user.pendingAdvice = null;
  queueSave();
}

export function recordOutcomeFromPending(username, outcome) {
  const user = ensureUser(username);
  const pending = user.pendingAdvice;
  if (!pending || !pending.scenarioKey) return null;

  const store = ensureLearningStore();
  const scenario = store.scenarios[pending.scenarioKey] || {
    scenarioKey: pending.scenarioKey,
    weaponTerm: pending.weaponTerm || "",
    ammoTerm: pending.ammoTerm || "",
    enemyTier: pending.enemyTier || null,
    map: pending.map || null,
    advisedVerdict: pending.advisedVerdict || "playable",
    outcomes: {
      good: 0,
      bad: 0,
      neutral: 0
    },
    lastOutcome: null,
    lastUpdatedAt: 0
  };

  let bucket = "neutral";
  if (outcome === "won" || outcome === "extract") bucket = "good";
  if (outcome === "died") bucket = "bad";

  scenario.outcomes[bucket] += 1;
  scenario.lastOutcome = outcome;
  scenario.lastUpdatedAt = Date.now();

  store.totals[bucket] = (store.totals[bucket] || 0) + 1;
  store.scenarios[pending.scenarioKey] = scenario;

  user.pendingAdvice = null;
  queueSave();

  return {
    scenarioKey: scenario.scenarioKey,
    bucket,
    scenario
  };
}

export function getScenarioLearning(scenarioKey) {
  const store = ensureLearningStore();
  return store.scenarios[scenarioKey] || null;
}

export function getLearningAdjustment(scenarioKey) {
  const scenario = getScenarioLearning(scenarioKey);
  if (!scenario) {
    return {
      adjustment: 0,
      confidence: 0,
      label: "no-learning"
    };
  }

  const good = scenario.outcomes.good || 0;
  const bad = scenario.outcomes.bad || 0;
  const neutral = scenario.outcomes.neutral || 0;
  const total = good + bad + neutral;

  if (!total) {
    return {
      adjustment: 0,
      confidence: 0,
      label: "no-learning"
    };
  }

  const halfLifeMs = Number(config.learningDecayHalfLifeDays || 14) * 24 * 60 * 60 * 1000;
  const ageMs = Math.max(0, Date.now() - (scenario.lastUpdatedAt || Date.now()));
  const decay = halfLifeMs > 0 ? Math.pow(0.5, ageMs / halfLifeMs) : 1;

  const raw = (good - bad) / total;
  const confidence = Math.min(1, total / 6) * decay;

  let label = "mixed";
  if (raw >= 0.5) label = "learned-good";
  else if (raw <= -0.5) label = "learned-bad";

  return {
    adjustment: raw * confidence,
    confidence,
    label,
    total,
    good,
    bad,
    neutral,
    decay
  };
}

export function summarizeLearning(scenarioKey) {
  const adj = getLearningAdjustment(scenarioKey);
  if (adj.label === "no-learning") return "no learned history yet";
  if (adj.label === "learned-good") return `learned good (${adj.good} good / ${adj.bad} bad)`;
  if (adj.label === "learned-bad") return `learned bad (${adj.good} good / ${adj.bad} bad)`;
  return `mixed history (${adj.good} good / ${adj.bad} bad / ${adj.neutral} neutral)`;
}

export function getLearningOverview() {
  const store = ensureLearningStore();
  const scenarioCount = Object.keys(store.scenarios || {}).length;
  return {
    scenarioCount,
    totals: store.totals || { good: 0, bad: 0, neutral: 0 }
  };
}


export function getTopLearningSignals(minSignal = 3) {
  const store = ensureLearningStore();
  return Object.values(store.scenarios || {})
    .map((scenario) => {
      const adj = getLearningAdjustment(scenario.scenarioKey);
      return { scenario, adj };
    })
    .filter(({ adj }) => (adj.good || 0) + (adj.bad || 0) + (adj.neutral || 0) >= minSignal)
    .sort((a, b) => Math.abs(b.adj.adjustment) - Math.abs(a.adj.adjustment));
}


export function markPendingOutcome(username, bucket) {
  const user = ensureUser(username);
  const pending = user.pendingAdvice;
  if (!pending || !pending.scenarioKey) return null;

  const store = ensureLearningStore();
  const scenario = store.scenarios[pending.scenarioKey] || {
    scenarioKey: pending.scenarioKey,
    weaponTerm: pending.weaponTerm || "",
    ammoTerm: pending.ammoTerm || "",
    enemyTier: pending.enemyTier || null,
    map: pending.map || null,
    advisedVerdict: pending.advisedVerdict || "playable",
    outcomes: { good: 0, bad: 0, neutral: 0 },
    lastOutcome: null,
    lastUpdatedAt: 0
  };

  scenario.outcomes[bucket] += 1;
  scenario.lastOutcome = bucket;
  scenario.lastUpdatedAt = Date.now();

  store.totals[bucket] = (store.totals[bucket] || 0) + 1;
  store.scenarios[pending.scenarioKey] = scenario;
  user.pendingAdvice = null;
  queueSave();

  return { scenarioKey: scenario.scenarioKey, scenario };
}

export function undoLastLearnedOutcome(username) {
  const user = ensureUser(username);
  const pending = user.pendingAdvice;
  if (!pending?.scenarioKey) return null;
  const store = ensureLearningStore();
  const scenario = store.scenarios[pending.scenarioKey];
  if (!scenario || !scenario.lastOutcome) return null;

  const bucket = scenario.lastOutcome;
  if (scenario.outcomes[bucket] > 0) scenario.outcomes[bucket] -= 1;
  if (store.totals[bucket] > 0) store.totals[bucket] -= 1;
  scenario.lastOutcome = null;
  scenario.lastUpdatedAt = Date.now();
  queueSave();
  return { scenarioKey: scenario.scenarioKey, bucket };
}
