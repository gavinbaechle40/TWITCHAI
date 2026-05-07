import fs from "fs";
import path from "path";

export function getVersionInfo() {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
  const datasetPath = path.resolve(process.cwd(), "data", "arena_breakout_infinite_full_dataset.xlsx");
  const metaCachePath = path.resolve(process.cwd(), "data", "meta_cache.json");

  const datasetStat = fs.existsSync(datasetPath) ? fs.statSync(datasetPath) : null;
  const cacheStat = fs.existsSync(metaCachePath) ? fs.statSync(metaCachePath) : null;

  return {
    botVersion: pkg.version,
    datasetLoadedAt: datasetStat ? datasetStat.mtime.toISOString() : "missing",
    metaCacheAt: cacheStat ? cacheStat.mtime.toISOString() : "missing"
  };
}
