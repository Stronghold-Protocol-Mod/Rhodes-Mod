// server/mod/toggle.js — the in-page 内容开关 (docs/MOD-RHODES.md §开关): switching a data mod of this checkout ON/OFF
// from the browser instead of a terminal, without stopping the server.
//
// WHY A DATA SWAP IS ENOUGH. A mod of this checkout is data-driven by contract: its code under server/sim/content/ is
// ALWAYS loaded and inert until data/*.json carries its records — `bonds.rhodesShip` is the 罗德岛 presence marker
// (server/sim/content/kits/mod.js modActive). So the switch is exactly "write the ON or the OFF variant of those files
// into data/", which is what `npm run mod:rhodes` / `mod:rhodes:strip` do — just without their rebuild.
//
// WHY IT IS LIVE. server/data.js keeps the bundle in a process-wide singleton and exposes resetData() for exactly this
// ("tests / hot reload"), and no module captures the bundle at import time. Two call sites do hold it:
//   * the Lobby — `createSessionStack` passes `getData: () => data`, a closure over the boot bundle (server/index.js).
//     It is handed `liveBundle` instead, so every `room.diy` check, every `welcome.diyKitted` and every match started
//     afterwards sees the new state (server/http/websocket.js).
//   * a RUNNING Match — it receives the bundle at its start and keeps it, which is the property that makes the switch
//     safe: an in-flight match keeps the data it began with. We still refuse to switch while any match runs
//     (applyToggle `matches`), because the browser re-fetches /data/*.json on reload and would then be out of step
//     with the field it is watching.
//
// Everything here is mod-owned: the six files, the registry (mod/toggles.json) and the snapshots (mod/variants/).

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_DIR, getData, resetData } from '../data.js';

/** The registry: `mod/toggles.json` next to the snapshots. */
export const REGISTRY_FILE = path.join(ROOT, 'mod', 'toggles.json');
/** The snapshots: `mod/variants/<id>/{on,off}/<file>.json`. */
export const VARIANTS_DIR = path.join(ROOT, 'mod', 'variants');

/** Codes applyToggle refuses with (mapped to HTTP statuses by the route). */
export const REFUSE = Object.freeze({
  UNKNOWN: 'unknown toggle',
  INVALID: 'invalid request',
  BUSY: 'a match is running',
  IO: 'the data could not be written',
  STALE: 'the switch did not take effect',
});

/**
 * A toggle as the registry describes it.
 * @typedef {{ id: string, name: string, englishName: string, description: string, files: string[],
 *   marker: { file: string, key: string } }} Toggle
 */

/** @type {{ at: number, list: Toggle[] } | null} */
let registryCache = null;
const REGISTRY_TTL_MS = 1000;

/**
 * The toggles of mod/toggles.json (cached briefly, so a dropped-in registry is picked up without a restart).
 * A malformed registry yields `[]` — never throws, the game must run without it (a checkout without the mod).
 * @returns {Toggle[]}
 */
export function listToggles() {
  const now = Date.now();
  if (registryCache && now - registryCache.at < REGISTRY_TTL_MS) return registryCache.list;
  /** @type {Toggle[]} */
  let list = [];
  try {
    const raw = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    const entries = Array.isArray(raw.toggles) ? raw.toggles : [];
    list = entries.filter((t) => t && typeof t.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(t.id)
      && Array.isArray(t.files) && t.files.length > 0 && t.files.every((f) => typeof f === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(f))
      && t.marker && typeof t.marker.file === 'string' && typeof t.marker.key === 'string')
      .map((t) => /** @type {Toggle} */ ({
        id: t.id, name: String(t.name ?? t.id), englishName: String(t.englishName ?? t.name ?? t.id),
        description: String(t.description ?? ''), files: t.files.slice(), marker: { file: t.marker.file, key: t.marker.key },
      }));
  } catch (e) {
    if (e && e.code !== 'ENOENT') console.error(`[mod] cannot read mod/toggles.json: ${e.message}`);
    list = [];
  }
  registryCache = { at: now, list };
  return list;
}

/** Drop the registry cache (tests, and a tool that just rewrote it). */
export function resetToggleRegistry() { registryCache = null; }

/** The toggle with this id, or null. @param {unknown} id */
export function toggleById(id) {
  return typeof id === 'string' ? listToggles().find((t) => t.id === id) || null : null;
}

/**
 * Whether a data bundle carries the toggle (its marker record present).
 * Tolerant of a raw bundle (`data.bonds`) and of a GameData/DataSource (`raw.bonds`) like kits/mod.js modActive.
 * @param {Toggle} toggle @param {any} data
 * @returns {boolean}
 */
export function isOn(toggle, data) {
  const bundle = data && typeof data === 'object' ? (data.raw && typeof data.raw === 'object' ? data.raw : data) : null;
  const file = bundle ? bundle[toggle.marker.file] : null;
  return !!(file && typeof file === 'object' && file[toggle.marker.key]);
}

/**
 * The state the browser shows: one entry per registered toggle.
 * @param {any} data the live bundle (server/data.js getData(), or the Lobby's safeData())
 * @param {{ canToggle?: boolean, matches?: number, reason?: string|null }} [opts]
 */
export function status(data, { canToggle = true, matches = 0, reason = null } = {}) {
  return {
    ok: true,
    matches,
    canToggle,
    reason,
    toggles: listToggles().map((t) => ({
      id: t.id, name: t.name, englishName: t.englishName, description: t.description, on: isOn(t, data),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------
// The live bundle
// ---------------------------------------------------------------------------------------------------

/** @type {Readonly<Record<string, any>> | null} */
let live = null;

/**
 * Point the live holder at a bundle. `server/index.js` calls it once at boot with the process singleton; the Lobby
 * then reads through `liveBundle` instead of a closure over the boot value, so a toggle reaches it.
 * @param {Readonly<Record<string, any>>} bundle
 */
export function setLiveBundle(bundle) { live = bundle; return bundle; }

/** The bundle the Lobby should read: the live one (falling back to the process singleton when never set). */
export function liveBundle() { return live || getData(); }

/** Re-read data/*.json into the singleton and the live holder. @param {object} [log] */
function reloadBundle(log = console) {
  resetData();
  live = getData({ log });
  return live;
}

// ---------------------------------------------------------------------------------------------------
// The directory of one variant
// ---------------------------------------------------------------------------------------------------

/** Whether the marker file of `dataDir` carries the key — the on-disk truth; null when it cannot be read. */
function markerOnDisk(toggle, dataDir) {
  try {
    const rec = JSON.parse(fs.readFileSync(path.join(dataDir, `${toggle.marker.file}.json`), 'utf8'));
    return !!(rec && typeof rec === 'object' && rec[toggle.marker.key]);
  } catch {
    return null;
  }
}

/** The directory holding one variant's files. @param {Toggle} toggle @param {boolean} on */
export function variantDir(toggle, on) {
  return path.join(VARIANTS_DIR, toggle.id, on ? 'on' : 'off');
}

/**
 * Read and fully validate a variant before anything is written: all files parse, and the marker matches the requested
 * state (so a half-built ON or a corrupt OFF is refused instead of written over data/).
 * @param {Toggle} toggle @param {boolean} on
 * @returns {{ ok: true, files: Map<string, Buffer> } | { ok: false, code: string, detail: string }}
 */
function readVariant(toggle, on) {
  const dir = variantDir(toggle, on);
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  for (const name of toggle.files) {
    const abs = path.join(dir, `${name}.json`);
    let buf;
    try {
      buf = fs.readFileSync(abs);
    } catch (e) {
      return { ok: false, code: REFUSE.IO, detail: `mod/variants/${toggle.id}/${on ? 'on' : 'off'}/${name}.json: ${e.code === 'ENOENT' ? 'missing' : e.message}` };
    }
    let parsed;
    try {
      parsed = JSON.parse(buf.toString('utf8'));
    } catch (e) {
      return { ok: false, code: REFUSE.IO, detail: `mod/variants/${toggle.id}/${on ? 'on' : 'off'}/${name}.json: not valid JSON (${e.message})` };
    }
    if (name === toggle.marker.file) {
      const has = !!(parsed && typeof parsed === 'object' && parsed[toggle.marker.key]);
      if (has !== on) {
        return { ok: false, code: REFUSE.IO, detail: `mod/variants/${toggle.id}/${on ? 'on' : 'off'}/${name}.json does not ${on ? 'carry' : 'lack'} ${toggle.marker.key}` };
      }
    }
    files.set(name, buf);
  }
  return { ok: true, files };
}

/**
 * Switch a toggle. Writes the variant's files into data/ (temp file + rename each, all temps written before the first
 * rename, so a failure leaves either the old state or the new one and never a half-written file), then reloads the
 * live bundle and VERIFIES the result — a switch that did not take effect is reported, not assumed.
 *
 * @param {unknown} id toggle id
 * @param {unknown} on desired state
 * @param {{ matches?: number, dataDir?: string, log?: object }} [opts] matches: running matches (0 to allow the switch)
 * @returns {{ ok: true, id: string, changed: boolean, on: boolean } | { ok: false, code: string, detail: string }}
 */
export function applyToggle(id, on, { matches = 0, dataDir = DATA_DIR, log = console } = {}) {
  const toggle = toggleById(id);
  if (!toggle) return { ok: false, code: REFUSE.UNKNOWN, detail: `no toggle "${String(id).slice(0, 32)}"` };
  if (typeof on !== 'boolean') return { ok: false, code: REFUSE.INVALID, detail: 'on must be true or false' };
  if (Number(matches) > 0) {
    return { ok: false, code: REFUSE.BUSY, detail: `${Number(matches)} 场对局进行中` };
  }

  // An unmounted data dir (tests) is written too, but only the process-wide bundle is reloaded afterwards.
  const variant = readVariant(toggle, on);
  if (!variant.ok) return variant;

  /** @type {[string, string][]} */
  const staged = [];
  try {
    for (const [name, buf] of variant.files) {
      const target = path.join(dataDir, `${name}.json`);
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, buf);
      staged.push([tmp, target]);
    }
    for (const [tmp, target] of staged) fs.renameSync(tmp, target);
  } catch (e) {
    for (const [tmp] of staged) { try { fs.unlinkSync(tmp); } catch { /* already renamed or gone */ } }
    return { ok: false, code: REFUSE.IO, detail: `${e.code || e.message}` };
  }

  // The process-wide singleton IS the directory the Lobby reads (unless a test pointed the switch elsewhere), so it is
  // re-read in place: from here every `room.diy` check, every `welcome.diyKitted` and every match started next sees
  // the new state. Matches already running keep the bundle they were handed and are untouched — which is why the
  // caller refuses to switch while one runs.
  if (path.resolve(dataDir) === path.resolve(DATA_DIR)) reloadBundle(log);

  // Verified by READING BACK what was written, not by trusting the writes: a switch that silently did not take effect
  // must be reported, or the page would reload into a state the server does not have.
  const landed = markerOnDisk(toggle, dataDir);
  if (landed !== on) {
    return { ok: false, code: REFUSE.STALE, detail: `data/ still reads as ${landed === null ? 'unreadable' : landed ? 'on' : 'off'}` };
  }
  log.info?.(`[mod] ${toggle.id} → ${on ? 'ON' : 'OFF'}`);
  return { ok: true, id: toggle.id, changed: true, on };
}
// ---------------------------------------------------------------------------------------------------
// Who may switch
// ---------------------------------------------------------------------------------------------------

/** Loopback addresses a request can arrive from (IPv4, IPv6, and the IPv4-mapped form node reports). */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Whether an HTTP request came from the machine running the server. The switch rewrites data/*.json, so it is offered
 * to the server's own operator only (docs/MOD-RHODES.md §开关): everyone else sees the state and follows it.
 * @param {import('node:http').IncomingMessage} req
 */
export function isLoopback(req) {
  const addr = req?.socket?.remoteAddress || '';
  return LOOPBACK.has(addr) || addr.startsWith('127.');
}
