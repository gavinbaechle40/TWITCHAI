import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
const backupDir = path.join(dataDir, 'backups');
const statePath = path.join(dataDir, 'state.json');
const saveDebounceMs = Number(process.env.STATE_SAVE_DEBOUNCE_MS || 750);

const defaultState = {
  context: { map: null, weapon: null, ammo: null, armorTier: null },
  playerStats: { wins: 0, deaths: 0, pushes: 0, extracts: 0 },
  recentQuestions: [],
  economy: { kitValue: 0, lifetimeProfit: 0, lastExtractValue: 0 },
  votes: { push: 0, rotate: 0, extract: 0, hold: 0 },
  streamMoments: { kills: 0, wipes: 0, clutches: 0, clips: 0 },
  settings: { roastMode: true, hypeMode: true, personality: 'funny' },
  randomEvents: { active: null, history: [], nextAt: 0 },
  users: {},
};

let state = null;
let saveTimer = null;
let dirty = false;

function defaultUserState() {
  return { raids: 0, deaths: 0, extracts: 0, wins: 0, pushes: 0, votes: 0, kills: 0, wipes: 0, clutches: 0, clips: 0, profit: 0, koen: 0, kitValue: 0, lastSeen: 0 };
}

function ensureShape(input = {}) {
  return {
    ...defaultState,
    ...input,
    context: { ...defaultState.context, ...(input.context || {}) },
    playerStats: { ...defaultState.playerStats, ...(input.playerStats || {}) },
    recentQuestions: Array.isArray(input.recentQuestions) ? input.recentQuestions.slice(-50) : [],
    economy: { ...defaultState.economy, ...(input.economy || {}) },
    votes: { ...defaultState.votes, ...(input.votes || {}) },
    streamMoments: { ...defaultState.streamMoments, ...(input.streamMoments || {}) },
    settings: { ...defaultState.settings, ...(input.settings || {}) },
    randomEvents: { ...defaultState.randomEvents, ...(input.randomEvents || {}) },
    users: input && typeof input.users === 'object' && input.users ? input.users : {},
  };
}

function atomicWrite(filepath, content) {
  const tmp = `${filepath}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filepath);
}

function saveNow() {
  fs.mkdirSync(dataDir, { recursive: true });
  atomicWrite(statePath, JSON.stringify(ensureShape(state), null, 2));
  dirty = false;
}

function scheduleSave() {
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { saveNow(); } catch (err) { console.error('State save failed:', err); }
  }, saveDebounceMs);
  saveTimer.unref?.();
}

export function flushState() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (dirty) saveNow();
}

export function initState() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  if (!fs.existsSync(statePath)) { state = ensureShape(defaultState); saveNow(); return state; }
  try { state = ensureShape(JSON.parse(fs.readFileSync(statePath, 'utf8'))); saveNow(); } catch { state = ensureShape(defaultState); saveNow(); }
  return state;
}
export function getState() { return state || initState(); }
export function patchState(mutator) { const current = getState(); mutator(current); state = ensureShape(current); scheduleSave(); return state; }
export function recordQuestion(username, input) { patchState(s => { s.recentQuestions.push({ username, input, at: Date.now() }); s.recentQuestions = s.recentQuestions.slice(-50); }); }
export function resetVotes() { patchState(s => { s.votes = { ...defaultState.votes }; }); }
export function ensureUser(stateObj, username) { const name = String(username || 'unknown').toLowerCase(); if (!stateObj.users[name]) stateObj.users[name] = defaultUserState(); stateObj.users[name] = { ...defaultUserState(), ...stateObj.users[name], lastSeen: Date.now() }; return stateObj.users[name]; }
export function writeBackup() {
  flushState();
  const current = getState(); fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(backupDir, `state_${ts}.json`); fs.writeFileSync(file, JSON.stringify(current, null, 2));
  const maxBackups = Number(process.env.MAX_STATE_BACKUPS || 24);
  const files = fs.readdirSync(backupDir).filter(f => f.startsWith('state_') && f.endsWith('.json')).map(f => ({ name: f, path: path.join(backupDir, f), mtime: fs.statSync(path.join(backupDir, f)).mtimeMs })).sort((a,b)=>b.mtime-a.mtime);
  for (const extra of files.slice(maxBackups)) fs.rmSync(extra.path, { force: true });
  return file;
}

process.on('SIGINT', () => { flushState(); process.exit(0); });
process.on('SIGTERM', () => { flushState(); process.exit(0); });
process.on('beforeExit', () => { flushState(); });
