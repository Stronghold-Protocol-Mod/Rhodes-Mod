// server/mod/kitted.js — 一个 MOD 自己重发的干员不走作者的自选池: the data-driven rule that keeps the 自选 (DIY) list honest
// while a mod is on. Part of the neutral content-switch FRAMEWORK (server/mod/registry.js, server/mod/toggle.js).
//
// Some operators are offered twice: the author ships a 自选 (DIY) record for them (data/backups.json `diy.ownedPool`),
// and a mod ships its own chess record for the same operator. While that mod is on, the author's pick would field the
// author's kit under the mod's banner — a different operator from the one the roster is built around, and (when the mod
// also ships the 特质 that kit grants) a second source of the same 特质. So while the mod is on the author's pick is
// not OFFERED. No file is dropped and the mod's own record is untouched: switch the mod off and the pick is back.
//
// The rule reads the DATA rather than naming operators, so it needs no per-mod list and cannot drift from one: an
// operator is hidden exactly when the applied data carries a mod record (`isMod`) for it AND the author offers it as a
// 自选 pick. Measured against the 罗德岛 mod it derives exactly that mod's five shared operators, and 阿米娅·医疗 —
// which the mod ships but the author's pool does not offer — stays visible.
//
// The data shapes are the ones every content module reads: a raw bundle (`data.chess`, `data.backups`) as
// server/data.js getData() and the Lobby's safeData() hand out. Anything unreadable ⇒ nothing is hidden, which is the
// safe default (the official pick stays offered).

/** An operator id off a raw record / pool entry, whichever way it spells it. @param {any} v */
const opIdOf = (v) => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof v.charId === 'string') return v.charId;
  return null;
};

/** The operator ids the applied data ships a MOD record for (data/chess.json records flagged `isMod`). */
function modShipped(data) {
  const out = new Set();
  const chess = data && typeof data === 'object' ? data.chess : null;
  const recs = Array.isArray(chess) ? chess : chess && typeof chess === 'object' ? Object.values(chess) : [];
  for (const rec of recs) {
    if (!rec || typeof rec !== 'object' || !rec.isMod) continue;
    const id = opIdOf(rec);
    if (id) out.add(id);
  }
  return out;
}

/** The operator ids the author offers as a 自选 (DIY) pick. */
function diyPool(data) {
  const out = new Set();
  const pool = data && typeof data === 'object' ? data.backups?.diy?.ownedPool : null;
  if (Array.isArray(pool)) { for (const p of pool) { const id = opIdOf(p); if (id) out.add(id); } }
  else if (pool && typeof pool === 'object') { for (const k of Object.keys(pool)) out.add(k); }
  return out;
}

/**
 * `base` without the author's 自选 picks of operators the applied data re-ships as a mod record.
 * @param {Iterable<string>} base the registry's KITTED_CHARS (kits/index.js) — passed in so this module stays free of
 *   the browser-safe registry (kits/index.js is imported by the client bundle too)
 * @param {any} data a raw bundle (server/data.js getData(), the Lobby's safeData())
 * @returns {string[]}
 */
export function modKitted(base, data) {
  const all = [...base];
  const shipped = modShipped(data);
  if (!shipped.size) return all;                    // no mod record applied: the official list, untouched
  const pool = diyPool(data);
  if (!pool.size) return all;
  return all.filter((c) => !(shipped.has(c) && pool.has(c)));
}
