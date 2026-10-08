// server/sim/content/kits/mod.js — 罗德岛 MOD (the local add-on, docs/MOD-RHODES.md): the data-aware bits of the 自选
// (DIY) integration that cannot live in kits/index.js.
//
// kits/index.js is BROWSER-SAFE by contract — it exports KITTED_CHARS and the registry with zero data access (no
// `node:*`, no data/*.json), and test/content/kits_layout.test.js asserts that. The "hide the author's 自选 version of
// an operator the mod also ships" rule, however, needs the data: it must fire exactly when the mod's data is applied
// (`npm run mod:rhodes`) and never otherwise (`npm run mod:rhodes:strip`). So it lives here, next to the 罗德岛 bond
// (bonds/rhodes.js), and reads the mod's presence off the data like every other content module does.
//
// The mod ships its own record for five operators the author also offers as 自选 picks (阿斯卡纶 / 可露希尔 /
// 凯尔希·思衡托 / 逻各斯 / Mon3tr): MOD_OPS. With the mod ON those picks would field the AUTHOR's kit under the mod's
// banner — a different operator from the one the roster is built around, and (for 阿米娅·医疗's sake) a second source of
// the same 特质. The user's decision: when the mod is ON the mod's version wins and the author's 自选 pick is not
// offered; when the mod is OFF the author's pick is back, untouched. We therefore SUBTRACT MOD_OPS from the kitted set
// (the filter shared/diy.js diyPool / checkDiyPicks already honour — KITTED_CHARS) rather than removing any file: no
// kit file is dropped, no test sees a shorter OPERATOR_KIT_FILES, and a strip restores the pick with zero code change.

/** The five operators the mod re-ships that the author also offers as a 自选 pick (charIds of data/backups.json
 * `diy.ownedPool`). 阿米娅·医疗 (`char_1037_amiya3`) is NOT here: the author's pool has no such operator, so there is
 * nothing to hide. Kept as literals so this module imports no builder. */
export const MOD_OPS = Object.freeze([
  'char_4228_closur',
  'char_4179_monstr',
  'char_4132_ascln',
  'char_1052_kalts2',
  'char_4133_logos',
]);

/** The bond id `tools/local-extract/build-rhodes-mod.mjs` writes into data/bonds.json — the mod's presence marker. */
export const MOD_BOND_ID = 'rhodesShip';

/**
 * True when the mod's data is applied. Tolerant of the two data shapes the call sites hold:
 *   - a raw bundle (`server/data.js getData()` / `lobby.safeData()`): `data.bonds[MOD_BOND_ID]`;
 *   - a DataSource (`gd`): `data.bonds` is absent there, so fall back to a normalised def (`def` of the bond) or to
 *     `data.gd` — the caller can also simply pass an explicit boolean.
 * A missing source yields false (mod OFF), which is the safe default: the official 自选 pick stays offered.
 * @param {any} data raw bundle, DataSource, or boolean
 * @returns {boolean}
 */
export function modActive(data) {
  if (typeof data === 'boolean') return data;
  if (!data || typeof data !== 'object') return false;
  const bonds = data.bonds ?? data.raw?.bonds ?? data.gd?.bonds;
  if (bonds && typeof bonds === 'object') return !!bonds[MOD_BOND_ID];
  // a DataSource with a normalised-bond lookup (some call sites only carry it)
  if (typeof data.def === 'function') { try { return !!data.def('bonds', MOD_BOND_ID); } catch { /* fall through */ } }
  return false;
}

/**
 * The kitted set the 自选 UI and the server's pick validation should use: `base` with MOD_OPS removed while the mod is
 * ON, `base` itself while it is OFF. `base` is the registry's KITTED_CHARS (kits/index.js); pass it in so this module
 * stays free of the browser-safe registry.
 * @param {Iterable<string>} base
 * @param {any} data raw bundle, DataSource, or boolean (see modActive)
 * @returns {string[]}
 */
export function effectiveKitted(base, data) {
  const all = [...base];
  if (!modActive(data)) return all;
  const drop = new Set(MOD_OPS);
  return all.filter((c) => !drop.has(c));
}
