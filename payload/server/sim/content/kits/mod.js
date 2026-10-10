// server/sim/content/kits/mod.js — 罗德岛 MOD (the local add-on, docs/MOD-RHODES.md): the mod's PRESENCE MARKER.
//
// A mod of this checkout is data-driven by contract: its code under server/sim/content/ is always loaded and inert
// until data/*.json carries its records. For 罗德岛 that record is the bond `rhodesShip` — the very key the content
// switch's registry entry names (`mod/toggles.d/rhodes.json`, `marker: { file: "bonds", key: "rhodesShip" }`), which is
// what makes 「the switch is exactly "write the ON or the OFF variant of the data files"」 true.
//
// This module is the one place the mod NAMES that key. test/content/mod_toggle.test.js pins it against the registry, so
// the constant and the switch can never drift apart.
//
// (The 「a mod's own operator is not offered as the author's 自选 pick」 rule used to live here as `MOD_OPS` /
// `effectiveKitted`. It is now the FRAMEWORK's data-driven `modKitted` — server/mod/kitted.js — because it applies to
// any mod, not just this one, and the Lobby is a shared file no single mod may own.)

/** The bond id `tools/local-extract/build-rhodes-mod.mjs` writes into data/bonds.json — the mod's presence marker. */
export const MOD_BOND_ID = 'rhodesShip';

/**
 * True when the mod's data is applied. Tolerant of the two data shapes the call sites hold:
 *   - a raw bundle (`server/data.js getData()` / `lobby.safeData()`): `data.bonds[MOD_BOND_ID]`;
 *   - a DataSource (`gd`): `data.bonds` is absent there, so fall back to a normalised def (`def` of the bond) or to
 *     `data.gd` — the caller can also simply pass an explicit boolean.
 * A missing source yields false (mod OFF), which is the safe default.
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
