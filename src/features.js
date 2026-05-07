import {
  dataset, aliases, normalize, toNumber, findWeapon, findAmmo, findArmor, searchLocalKnowledge, weaponSummary, ammoSummary, armorSummary,
} from './db.js';
import { wikiLookup } from './wiki.js';
import { polishReply } from './llm.js';
import { responseCache } from './cache.js';
import { getState, patchState, recordQuestion, resetVotes, ensureUser } from './stateManager.js';
import { tryParticipate, randomEventStatus } from './randomEvents.js';

const roastLines = ['That one was less of a fight and more of a donation.','You saw the danger and still introduced yourself personally.','That kit deserved a better life than that push.','You got sent back to stash management, chief.'];
const killHype = ['NAHH you fried him. Chat, put that man on the grill.','That was criminal. Somebody clip the evidence.','Sent him to the lobby with express shipping.'];
const wipeHype = ['Whole squad deleted. That was not a fight, that was pest control.','Wipe confirmed. They ran into a tax audit with bullets.','Squad erased. Somebody tell chat to type CLIP IT.'];
const clutchHype = ['Clutch secured. Ice in the veins, chaos in the lobby.','That was nasty work. Controller needs witness protection.','Clutch god behavior. Respectfully disrespectful.'];
const clipLines = ['CLIPPED. If that was mid, then I am a toaster.','Clip saved. That better be on the highlight reel by sunrise.','Stamped and clipped. Content acquired.'];
const personalVoices = {
  funny: 'Keep it concise, helpful, and funny.',
  coach: 'Keep it concise, tactical, and direct.',
  roast: 'Keep it concise, useful, and playfully roast the user.',
  hype: 'Keep it concise, energetic, and hype.'
};

function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
function fmt(num) { return Number(num || 0).toLocaleString(); }
function survivalRate(stats) { const raids = Number(stats.raids || (stats.deaths + stats.extracts)); return raids ? ((stats.extracts / raids) * 100).toFixed(1) : '0.0'; }
function armorTierFromText(text) { const match = String(text).match(/(?:t|tier|class)\s*([1-6])/i); return match ? Number(match[1]) : null; }
function ammoVsArmorVerdict(ammo, armorTier, weapon) { const pen = toNumber(ammo?.penetration) ?? 0; const pierce = toNumber(ammo?.pierce_level) ?? 0; const rof = toNumber(weapon?.rate_of_fire) ?? 0; const category = String(weapon?.category ?? ''); let strength = pen + pierce * 7 + (/Submachine|Shotgun/i.test(category) ? -6 : 0) + (rof > 750 ? 4 : 0); const target = armorTier * 12; if (strength >= target + 8) return 'push'; if (strength >= target - 2) return 'coinflip'; return 'run'; }
function categoryRole(weapon) { const category = String(weapon?.category ?? ''); if (/Submachine|Shotgun/i.test(category)) return 'cqb'; if (/Sniper|Marksman/i.test(category)) return 'long'; return 'flex'; }
function parseMapType(text) { const q = normalize(text); if (q.includes('tv station') || q.includes('armory')) return 'cqb'; if (q.includes('farm') || q.includes('valley') || q.includes('northridge')) return 'mixed'; return null; }
function topWeapons(filterFn = () => true) { return dataset.weapons.filter(filterFn).slice(0, 5); }
function topAmmo(filterFn = () => true) { return dataset.ammo.filter(filterFn).slice(0, 5); }
function topArmor(filterFn = () => true) { return dataset.armor.filter(filterFn).slice(0, 5); }
function smartLoadoutLine(state, baseLine) { const kitValue = Number(state.economy?.kitValue || 0); if (kitValue >= 90000) return `${baseLine} Also your current kit is pricey, so maybe chill on the hero plays.`; if (kitValue && kitValue <= 35000) return `${baseLine} Cheap enough to risk, so you can play a little louder.`; return baseLine; }
function isMod(meta) { return Boolean(meta?.isMod || meta?.isBroadcaster); }
function parseNaturalCommand(text) {
  const q = normalize(text);
  if (/should i push/.test(q)) return 'shouldipush ' + text;
  if (/rate my kit|rate kit/.test(q)) return 'ratekit ' + text;
  if (/best loadout|what loadout/.test(q)) return 'loadout ' + text;
  if (/compare/.test(q)) return text;
  if (/worth|value/.test(q)) return 'value ' + text;
  return text;
}
async function concise(question, answer, personality='funny') { const shouldUseLlm = Boolean(process.env.OPENAI_API_KEY) && String(question).trim().split(/\s+/).length > 4; if (!shouldUseLlm) return answer; return polishReply({ question: `${personalVoices[personality] || personalVoices.funny} ${question}`, answer }); }

export async function handleAbiCommand(rawInput, username, meta = {}) {
  const input = parseNaturalCommand(rawInput.trim());
  const state = getState();
  const q = normalize(input);
  const cacheable = !/^(setmap|setkit|setkitvalue|setextractvalue|died|won|extract|context|profile|stats|kill|wipe|clutch|clip|vote|voteresult|votedown|votereset|mystats|leaderboard|wins|losses|profit|resetstats|summary|toggle|personality)/.test(q);
  const cacheKey = `${username}|${q}|${normalize(state.context.map || '')}|${normalize(state.context.weapon || '')}|${normalize(state.context.ammo || '')}|${state.context.armorTier || ''}|${state.settings.personality}`;
  if (cacheable) { const cached = responseCache.get(cacheKey); if (cached) return cached; }
  recordQuestion(username, input); ensureUser(state, username);
  async function done(answer, ttlMs) { const finalAnswer = answer ? String(answer).slice(0, 450) : answer; if (cacheable && finalAnswer) responseCache.set(cacheKey, finalAnswer, ttlMs); return finalAnswer; }

  if (!q || q === 'help') return done('Try: shouldipush, ratekit, loadout, value, worth, meta, compare, setmap, setkit, context, summary, event, loot, secure, evac, personality, mystats, leaderboard, or ask a game question.', 3600000);
  if (q === 'help admin') return done('Mod commands: resetstats, votereset, setmap tv station, toggle roast, toggle hype, personality funny|coach|roast|hype, summary.', 3600000);
  if (q === 'help combat') return done('Combat: shouldipush mp5 ap vs t5 | fightcheck m4a1 m855 vs t4 | ratekit akm ps t3 | loadout budget | compare akm vs m4a1', 3600000);
  if (q === 'help loot') return done('Value: value m995 | worth m4a1 vs akm | setkitvalue 75000 | setextractvalue 120000 | died | extract | profit | event | loot | secure | evac | summary', 3600000);

  if (q === 'event') {
    const status = randomEventStatus();
    return done(status || 'No random event is active right now. Hang tight for the next drop.', 15000);
  }
  if (q === 'loot' || q === 'secure' || q === 'evac') {
    const result = tryParticipate(username, q);
    return done(result.message, 5000);
  }

  if (q === 'kill') { state.streamMoments.kills += 1; ensureUser(state, username).kills += 1; patchState(() => {}); return state.settings.hypeMode ? pick(killHype) : 'Kill logged.'; }
  if (q === 'wipe') { state.streamMoments.wipes += 1; ensureUser(state, username).wipes += 1; patchState(() => {}); return state.settings.hypeMode ? pick(wipeHype) : 'Wipe logged.'; }
  if (q === 'clutch') { state.streamMoments.clutches += 1; ensureUser(state, username).clutches += 1; patchState(() => {}); return state.settings.hypeMode ? pick(clutchHype) : 'Clutch logged.'; }
  if (q === 'clip') { state.streamMoments.clips += 1; ensureUser(state, username).clips += 1; patchState(() => {}); return state.settings.hypeMode ? pick(clipLines) : 'Clip logged.'; }

  if (q.startsWith('setkitvalue')) { const value = Number(input.replace(/setkitvalue/i, '').trim().replace(/[^0-9]/g, '')); if (!value) return 'Give me a number. Example: !abi setkitvalue 75000'; state.economy.kitValue = value; ensureUser(state, username).kitValue = value; patchState(() => {}); return `Kit value set to ${fmt(value)} Koen.`; }
  if (q.startsWith('setextractvalue')) { const value = Number(input.replace(/setextractvalue/i, '').trim().replace(/[^0-9]/g, '')); if (!value) return 'Give me a number. Example: !abi setextractvalue 120000'; state.economy.lastExtractValue = value; patchState(() => {}); return `Extract value set to ${fmt(value)} Koen.`; }

  if (q.startsWith('vote ')) { const choice = normalize(input.replace(/vote/i, '').trim()); if (!Object.prototype.hasOwnProperty.call(state.votes, choice)) return 'Vote options: push, rotate, extract, hold.'; state.votes[choice] += 1; ensureUser(state, username).votes += 1; patchState(() => {}); return `${username} voted ${choice}.`; }
  if (q === 'votedown' || q === 'votereset') { if (!isMod(meta)) return 'Mods only for vote resets, chief.'; resetVotes(); return 'Votes reset.'; }
  if (q === 'voteresult' || q === 'vote result') { const entries = Object.entries(state.votes).sort((a,b)=>b[1]-a[1]); const [choice, count] = entries[0] || ['push', 0]; return `Vote result: ${choice.toUpperCase()} with ${count} vote${count === 1 ? '' : 's'}.`; }

  if (q.startsWith('setmap')) { const map = input.replace(/setmap/i, '').trim(); state.context.map = map || null; patchState(() => {}); return `Map set to ${map || 'nothing'}.`; }
  if (q.startsWith('setkit')) { const rest = input.replace(/setkit/i, '').trim(); const tier = armorTierFromText(rest); const weapon = findWeapon(rest); const ammo = findAmmo(rest); state.context.weapon = weapon?.name ?? null; state.context.ammo = ammo?.ammo_name ?? null; state.context.armorTier = tier; patchState(() => {}); return `Kit saved: ${weapon?.name ?? 'unknown gun'}, ${ammo?.ammo_name ?? 'unknown ammo'}, armor ${tier ? `T${tier}` : 'unknown'}.`; }
  if (q === 'context') { const bits = []; if (state.context.map) bits.push(`map ${state.context.map}`); if (state.context.weapon) bits.push(`gun ${state.context.weapon}`); if (state.context.ammo) bits.push(`ammo ${state.context.ammo}`); if (state.context.armorTier) bits.push(`armor T${state.context.armorTier}`); return bits.length ? `Current context: ${bits.join(', ')}.` : `No context saved yet.`; }

  if (q === 'died') { state.playerStats.deaths += 1; const loss = Number(state.economy.kitValue || 0); state.economy.lifetimeProfit -= loss; const user = ensureUser(state, username); user.deaths += 1; user.raids += 1; user.profit -= loss; patchState(() => {}); const roast = state.settings.roastMode ? ` ${pick(roastLines)}` : ''; return loss ? `Death logged. About ${fmt(loss)} Koen gone.${roast}` : `Death logged.${roast}`; }
  if (q === 'won') { state.playerStats.wins += 1; ensureUser(state, username).wins += 1; patchState(() => {}); return `Logged a win. Cooked them boys.`; }
  if (q === 'extract') { state.playerStats.extracts += 1; const gross = Number(state.economy.lastExtractValue || 0); const kit = Number(state.economy.kitValue || 0); const net = gross - kit; state.economy.lifetimeProfit += net; const user = ensureUser(state, username); user.extracts += 1; user.raids += 1; user.profit += net; patchState(() => {}); return gross ? `Extraction logged: ${gross >= kit ? '+' : ''}${fmt(net)} Koen net on ${fmt(gross)} out.` : `Extraction logged. Set extract value if you want profit tracking.`; }
  if (q.includes('push')) { state.playerStats.pushes += 1; ensureUser(state, username).pushes += 1; patchState(() => {}); }
  if (q === 'stats' || q === 'profile') { const { wins, deaths, pushes, extracts } = state.playerStats; const kd = deaths ? (wins / deaths).toFixed(2) : wins.toFixed(2); const survive = survivalRate({ raids: deaths + extracts, extracts }); const econ = Number(state.economy.lifetimeProfit || 0); return `Stats: ${wins} wins, ${deaths} deaths, ${extracts} extracts, ${pushes} push calls, ${survive}% survival, W/D ${kd}, lifetime ${econ >= 0 ? '+' : ''}${fmt(econ)} Koen.`; }
  if (q === 'mystats' || q === 'me') { const u = ensureUser(state, username); const raids = u.raids || (u.deaths + u.extracts); return `@${username} raids ${raids}, extracts ${u.extracts}, deaths ${u.deaths}, wins ${u.wins}, pushes ${u.pushes}, votes ${u.votes}, survival ${survivalRate(u)}%, profit ${u.profit >= 0 ? '+' : ''}${fmt(u.profit)} Koen.`; }
  if (q === 'wins' || q === 'losses' || q === 'profit') { const key = q === 'wins' ? 'wins' : q === 'losses' ? 'deaths' : 'profit'; const label = q === 'losses' ? 'deaths' : key; const entries = Object.entries(state.users || {}).map(([name, stats]) => [name, Number(stats?.[key] || 0)]).sort((a,b)=>b[1]-a[1]).slice(0,5); if (!entries.length) return `No ${label} tracked yet.`; return `Top ${label}: ` + entries.map(([name, value], i) => `${i + 1}. ${name} ${value}`).join(' | '); }
  if (q === 'leaderboard' || q === 'leaders') { const entries = Object.entries(state.users || {}).map(([name, stats]) => { const raids = Number(stats?.raids || (Number(stats?.deaths || 0) + Number(stats?.extracts || 0))); const profit = Number(stats?.profit || 0); const score = Number(stats?.wins || 0) * 4 + Number(stats?.extracts || 0) * 3 - Number(stats?.deaths || 0) + profit / 50000; return { name, score, raids, profit }; }).filter(x => x.raids > 0 || x.profit !== 0).sort((a,b)=>b.score-a.score).slice(0,5); if (!entries.length) return 'Leaderboard is empty.'; return 'Leaderboard: ' + entries.map((x, i) => `${i + 1}. ${x.name} (${x.score.toFixed(1)} pts, ${x.profit >= 0 ? '+' : ''}${fmt(x.profit)} Koen)`).join(' | '); }

  if (q === 'summary') { const ps = state.playerStats; const econ = state.economy; const rq = state.recentQuestions.slice(-3).map(x => x.input).join(' / '); return `Stream summary: ${ps.wins} wins, ${ps.deaths} deaths, ${ps.extracts} extracts, ${survivalRate({ raids: ps.deaths + ps.extracts, extracts: ps.extracts })}% survival, lifetime ${econ.lifetimeProfit >= 0 ? '+' : ''}${fmt(econ.lifetimeProfit)} Koen, ${state.streamMoments.kills} kills, ${state.streamMoments.wipes} wipes, ${state.streamMoments.clutches} clutches. Recent asks: ${rq || 'none yet'}.`; }

  if (q.startsWith('toggle ')) {
    if (!isMod(meta)) return 'Mods only for toggles.';
    const which = normalize(input.replace(/^toggle/i, '').trim());
    if (which === 'roast') { state.settings.roastMode = !state.settings.roastMode; patchState(() => {}); return `Roast mode ${state.settings.roastMode ? 'on' : 'off'}.`; }
    if (which === 'hype') { state.settings.hypeMode = !state.settings.hypeMode; patchState(() => {}); return `Hype mode ${state.settings.hypeMode ? 'on' : 'off'}.`; }
    return 'Toggle options: roast, hype.';
  }
  if (q.startsWith('personality ')) {
    if (!isMod(meta)) return 'Mods only for personality swaps.';
    const which = normalize(input.replace(/^personality/i, '').trim());
    if (!personalVoices[which]) return 'Choose: funny, coach, roast, hype.';
    state.settings.personality = which; patchState(() => {}); return `Personality set to ${which}.`; }
  if (q === 'personality') return `Current personality: ${state.settings.personality}. Options: funny, coach, roast, hype.`;
  if (q === 'resetstats') { if (!isMod(meta)) return 'Mods only for stat resets.'; patchState(s => { s.playerStats = { wins: 0, deaths: 0, pushes: 0, extracts: 0 }; s.economy = { kitValue: 0, lifetimeProfit: 0, lastExtractValue: 0 }; s.streamMoments = { kills: 0, wipes: 0, clutches: 0, clips: 0 }; }); return 'Stream stats reset. Brand new chaos.'; }

  if (q.startsWith('shouldipush') || q.startsWith('fightcheck')) { const tier = armorTierFromText(input) ?? state.context.armorTier ?? 4; const weapon = findWeapon(input) || (state.context.weapon ? findWeapon(state.context.weapon) : null); const ammo = findAmmo(input) || (state.context.ammo ? findAmmo(state.context.ammo) : null); if (!weapon || !ammo) return done('I need a gun and ammo. Example: !abi shouldipush m4a1 m855 vs t4', 3600000); const verdict = ammoVsArmorVerdict(ammo, tier, weapon); const style = categoryRole(weapon); const mapType = parseMapType(state.context.map || ''); let answer = verdict === 'push' ? `${weapon.name} with ${ammo.ammo_name} into T${tier}? Yeah, that can work. Take smart angles.` : verdict === 'coinflip' ? `${weapon.name} with ${ammo.ammo_name} into T${tier} is playable but sketchy. Win the angle first.` : `${weapon.name} with ${ammo.ammo_name} into T${tier}? Nah. That is charity. Rotate or disengage.`; if (mapType === 'cqb' && style === 'cqb') answer += ' CQB map helps your case.'; if (mapType === 'mixed' && style === 'cqb') answer += ' Open ground hurts that setup though.'; return done(await concise(input, answer, state.settings.personality), 1800000); }
  if (q.startsWith('ratekit')) { const tier = armorTierFromText(input) ?? 3; const weapon = findWeapon(input); const ammo = findAmmo(input); if (!weapon || !ammo) return done('Give me at least a gun and ammo. Example: !abi ratekit akm ps t3', 3600000); const weaponScore = weapon.meta_tier === 'S' ? 9 : weapon.meta_tier === 'A' ? 8 : weapon.meta_tier === 'B' ? 6 : 4; const ammoScore = (toNumber(ammo.pierce_level) ?? 1) * 2 + (toNumber(ammo.penetration) ?? 0) / 15; const armorScore = Math.min(10, tier * 1.9); const total = Math.max(1, Math.min(10, Math.round((weaponScore * 0.4 + ammoScore * 0.4 + armorScore * 0.2) * 10) / 10)); const verdict = total >= 8.5 ? 'nasty' : total >= 7 ? 'solid' : total >= 5 ? 'budget' : 'sus'; return done(await concise(input, `Kit rating: ${total}/10. ${weapon.name} + ${ammo.ammo_name} + T${tier} is ${verdict}.`, state.settings.personality), 1800000); }
  if (q.startsWith('loadout')) { const text = input.replace(/loadout/i, '').trim(); const lower = normalize(text); let recommendation; if (lower.includes('budget')) { const weapon = topWeapons(w => w.meta_tier !== 'C' && w.approx_price_koen < 35000)[0] ?? dataset.weapons[0]; const ammo = topAmmo(a => (toNumber(a.pierce_level) ?? 0) >= 2 && a.approx_price_koen < 300)[0] ?? dataset.ammo[0]; const armor = topArmor(a => a._kind !== 'helmet' && (toNumber(a.armor_class) ?? 0) <= 3)[0]; recommendation = smartLoadoutLine(state, `Budget kit: ${weapon.name}, ${ammo.ammo_name}, ${armor?.name ?? 'T3 armor'}. Cheap enough to lose, strong enough to ruin somebody’s day.`); } else if (lower.includes('tv station') || lower.includes('armory')) { const weapon = topWeapons(w => /Submachine Gun|Assault Rifle/i.test(String(w.category)))[0]; const ammo = topAmmo(a => (toNumber(a.pierce_level) ?? 0) >= 4)[0]; recommendation = smartLoadoutLine(state, `CQB kit: ${weapon.name}, ${ammo.ammo_name}, class 4+ armor.`); } else { const weapon = topWeapons(w => /Assault Rifle|Marksman Rifle/i.test(String(w.category)))[0]; const ammo = topAmmo(a => (toNumber(a.pierce_level) ?? 0) >= 3)[0]; recommendation = smartLoadoutLine(state, `Balanced kit: ${weapon.name}, ${ammo.ammo_name}, class 4 armor.`); } return done(await concise(input, recommendation, state.settings.personality), 3600000); }
  if (q.startsWith('value')) { const term = input.replace(/value/i, '').trim(); const found = searchLocalKnowledge(term); if (!found) return done('Could not price that from the local sheets.', 3600000); if (found.type === 'weapon') return done(await concise(input, `${found.item.name} is roughly ${fmt(found.item.approx_price_koen)} Koen.`, state.settings.personality), 3600000); if (found.type === 'ammo') return done(await concise(input, `${found.item.ammo_name} is about ${fmt(found.item.approx_price_koen)} Koen per round.`, state.settings.personality), 3600000); return done(await concise(input, `${found.item.name} is about ${fmt(found.item.approx_price_koen)} Koen.`, state.settings.personality), 3600000); }
  if (q.startsWith('worth ')) { const [leftRaw, rightRaw] = input.replace(/^worth\s+/i, '').split(/\s+vs\s+/i); if (!leftRaw || !rightRaw) return 'Use: !abi worth item a vs item b'; const left = searchLocalKnowledge(leftRaw); const right = searchLocalKnowledge(rightRaw); if (!left || !right) return 'I need two local items for that comparison.'; const lv = Number(left.item.approx_price_koen || 0), rv = Number(right.item.approx_price_koen || 0); const better = lv >= rv ? left : right; return `${better.item.name || better.item.ammo_name} wins on raw value: ${fmt(Math.max(lv, rv))} vs ${fmt(Math.min(lv, rv))} Koen.`; }
  if (q.startsWith('meta')) { const rest = normalize(input.replace(/meta/i, '').trim()); if (rest.includes('ammo')) return done(`Top ammo: ` + dataset.ammo.slice(0,3).map(a => `${a.ammo_name} (P${a.penetration}/L${a.pierce_level})`).join(', '), 3600000); if (rest.includes('armor')) return done(`Top armor: ` + dataset.armor.slice(0,3).map(a => `${a.name} (class ${a.armor_class})`).join(', '), 3600000); if (rest.includes('smg')) return done(`Top SMGs: ` + dataset.weapons.filter(w => /Submachine/i.test(String(w.category))).slice(0,3).map(w => w.name).join(', '), 3600000); return done(`Meta picks: guns ${dataset.weapons.slice(0,3).map(w=>w.name).join(', ')} | ammo ${dataset.ammo.slice(0,2).map(a=>a.ammo_name).join(', ')} | armor ${dataset.armor.slice(0,2).map(a=>a.name).join(', ')}`, 3600000); }
  if (q.startsWith('compare')) { const parts = input.replace(/^compare/i, '').split(/\s+vs\s+/i); if (parts.length < 2) return 'Use: !abi compare akm vs m4a1'; const leftTerm = parts[0].trim(), rightTerm = parts[1].trim(); const left = searchLocalKnowledge(leftTerm), right = searchLocalKnowledge(rightTerm); if (left?.type === 'weapon' && right?.type === 'weapon') return done(await concise(input, `${left.item.name}: ${weaponSummary(left.item)} ${right.item.name}: ${weaponSummary(right.item)} Winner for general use: ${left.item.meta_score >= right.item.meta_score ? left.item.name : right.item.name}.`, state.settings.personality), 3600000); if (left?.type === 'ammo' && right?.type === 'ammo') return done(await concise(input, `${left.item.ammo_name}: ${ammoSummary(left.item)} ${right.item.ammo_name}: ${ammoSummary(right.item)} Better all-around pen: ${toNumber(left.item.penetration) >= toNumber(right.item.penetration) ? left.item.ammo_name : right.item.ammo_name}.`, state.settings.personality), 3600000); if (left && right) return done(`${left.item.name || left.item.ammo_name} is about ${fmt(left.item.approx_price_koen)} Koen vs ${fmt(right.item.approx_price_koen)} for ${right.item.name || right.item.ammo_name}.`, 3600000); }

  const local = searchLocalKnowledge(input);
  if (local) {
    const answer = local.type === 'weapon' ? weaponSummary(local.item) : local.type === 'ammo' ? ammoSummary(local.item) : armorSummary(local.item);
    return done(await concise(input, answer, state.settings.personality), 3600000);
  }
  const wiki = await wikiLookup(input);
  if (wiki) return done(await concise(input, wiki, state.settings.personality), 3600000);
  return done(`I could not find that cleanly. Try a more specific gun, ammo, armor piece, or map. Alias examples: ${Object.keys(aliases).slice(0,5).join(', ')}.`, 3600000);
}

export function reactiveReply(message) {
  const state = getState();
  const q = normalize(message);
  if (q.includes('clip that')) return state.settings.hypeMode ? 'Already mentally clipped, chat.' : null;
  if (q.includes('he is dead') || q.includes("he's dead")) return state.settings.roastMode ? 'Do not celebrate early. The lobby punishes arrogance.' : null;
  if (q.includes('no way')) return 'There was definitely a way, and it just happened.';
  return null;
}
