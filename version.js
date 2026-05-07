import fs from "fs";
import path from "path";
import { getState } from "./state.js";
import { getLearningOverview, getTopLearningSignals } from "./metaLearning.js";

const EXPORT_DIR = path.resolve(process.cwd(), "exports");

function ensureDir() {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

export function exportSummary() {
  ensureDir();
  const s = getState();
  const learning = getLearningOverview();
  const signals = getTopLearningSignals(1).slice(0, 5).map(({ scenario, adj }) => ({
    scenarioKey: scenario.scenarioKey,
    adjustment: adj.adjustment,
    good: adj.good,
    bad: adj.bad,
    neutral: adj.neutral,
    label: adj.label
  }));

  const payload = {
    exportedAt: new Date().toISOString(),
    stats: s.stats,
    shared: s.shared,
    learning,
    topSignals: signals
  };

  const file = path.join(EXPORT_DIR, `summary_${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}
