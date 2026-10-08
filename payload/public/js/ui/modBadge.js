// public/js/ui/modBadge.js — the 内容开关 badge of the title screen (docs/MOD-RHODES.md §开关).
//
// Shows whether each data mod of THIS server is on, and lets the machine running the server switch it without a
// terminal. The state comes from GET /mod/state (server/mod/api.js), which answers without a session — the title
// screen is shown before `hello`, so a socket intent could not carry it. The badge re-reads it every MOD_POLL_MS
// while it is on screen (a tiny no-store JSON; the screen is transient) and also honours the `mod.state` push the
// server sends to every connected session when someone switches (main.js installModState) — which is how a shared
// server's guests learn that the host changed something under them.
//
// Switching is POST /mod/toggle?id=&on= (loopback only: the reply of a refused request says why — `REMOTE` for an
// address that is not the server's own machine, `a match is running` while a match refuses the change). A successful
// switch answers with the new state AND makes every /data/*.json the page fetched stale, so the page reloads itself
// once the reply is in: at the title screen there is nothing to lose, and a reload is what refetches the data.

import { useEffect } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { toast } from './toasts.js';
import { net } from '../net.js';
import { store, useStore, shallowEqual } from '../store.js';
import { t } from '../../../shared/i18n.js';

/** How often the badge re-reads /mod/state while it is mounted (the title screen only). */
export const MOD_POLL_MS = 5000;

/** The empty store slice (before the first answer). */
export const EMPTY_MOD = Object.freeze({
  ready: false, canToggle: false, reason: null, matches: 0, toggles: [], stale: false, busy: false,
});

/** The state the badge renders — exported for tests. @param {any} s store state */
export const selectMod = (s) => s.mod;

/** Whether two /mod/state answers describe the same switch positions. */
function sameToggles(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((x, i) => x.id === b[i].id && x.on === b[i].on);
}

/**
 * Adopt a /mod/state body (or a pushed mod.state frame) into the store.
 * `pushed` marks a change somebody else made: the page's /data/*.json are then stale and it offers a reload.
 * @param {any} body
 * @param {{ pushed?: boolean }} [opts]
 */
export function adoptModState(body, { pushed = false } = {}) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.toggles)) return;
  const prev = store.get().mod || EMPTY_MOD;
  const toggles = body.toggles
    .filter((tg) => tg && typeof tg.id === 'string')
    .map((tg) => ({ id: tg.id, name: String(tg.name ?? tg.id), englishName: String(tg.englishName ?? tg.name ?? tg.id), on: !!tg.on }));
  const changedElsewhere = pushed && prev.ready && !sameToggles(prev.toggles, toggles);
  store.patch('mod', {
    ready: true,
    canToggle: !!body.canToggle,
    reason: body.reason ?? null,
    matches: Number(body.matches) || 0,
    toggles,
    stale: prev.stale || changedElsewhere,
  });
}

/** Read GET /mod/state. Never throws; a failure leaves the store untouched (the badge just stays hidden). */
export async function refreshModState(fetchFn = (...a) => globalThis.fetch(...a)) {
  try {
    const res = await fetchFn('/mod/state', { cache: 'no-store' });
    if (!res || !res.ok) return null;
    const body = await res.json();
    adoptModState(body);
    return body;
  } catch {
    return null;
  }
}

/**
 * Wire the `mod.state` push into the store. Called once by main.js's wireNet().
 * @param {import('../net.js').Net} [netRef]
 */
export function installModState(netRef = net) {
  netRef.on('mod.state', (msg) => adoptModState(msg, { pushed: true }));
}

/**
 * Switch one toggle. Reloads the page on success (the fetched /data/*.json are stale by then).
 * @param {{ id: string, name: string, on: boolean }} toggle
 */
export async function switchToggle(toggle, fetchFn = (...a) => globalThis.fetch(...a)) {
  const mod = store.get().mod || EMPTY_MOD;
  if (!mod.canToggle) {
    toast(mod.reason === 'matches' ? t('有对局正在进行，无法切换 MOD') : t('只有运行服务器的本机可以切换 MOD'), 'warn');
    return false;
  }
  if (mod.busy) return false;
  store.patch('mod', { busy: true });
  try {
    const res = await fetchFn(`/mod/toggle?id=${encodeURIComponent(toggle.id)}&on=${toggle.on ? 0 : 1}`, { method: 'POST', cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.ok !== true) {
      const detail = body && body.text ? body.text : t('切换失败');
      toast(String(detail), 'warn', { ttl: 6000 });
      await refreshModState(fetchFn); // the server's own view is authoritative (e.g. a match started meanwhile)
      return false;
    }
    adoptModState({ ...body, canToggle: true, reason: null, matches: mod.matches });
    toast(t('已切换：{name} {state}，正在重新载入数据…', {
      name: toggle.name, state: toggle.on ? t('已关闭') : t('已开启'),
    }), 'success');
    setTimeout(() => { try { location.reload(); } catch { /* jsdom / tests */ } }, 700);
    return true;
  } catch {
    toast(t('切换失败'), 'warn');
    return false;
  } finally {
    store.patch('mod', { busy: false });
  }
}

/** The badge. Renders nothing until a state has been read, and nothing when the server registers no toggle. */
export function ModBadge() {
  const mod = useStore(selectMod, shallowEqual);
  useEffect(() => {
    let alive = true;
    refreshModState();
    const id = setInterval(() => { if (alive) refreshModState(); }, MOD_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);
  if (!mod || !mod.ready || !mod.toggles.length) return null;

  const locked = !mod.canToggle;
  const tip = locked
    ? (mod.reason === 'matches' ? t('有对局正在进行（{n} 场），本局结束后可切换', { n: mod.matches }) : t('只有运行服务器的本机可以切换'))
    : t('点击切换');

  return html`<div class="mod-badge-row" role="group" aria-label=${t('MOD 开关')}>
    ${mod.toggles.map((tg) => html`<button type="button"
      class=${`mod-badge${tg.on ? ' is-on' : ''}${locked ? ' is-locked' : ''}${mod.busy ? ' is-busy' : ''}`}
      aria-pressed=${tg.on} title=${tip}
      onClick=${() => switchToggle(tg)}>
      <span class="mod-badge__dot" aria-hidden="true"></span>
      <span class="mod-badge__name">${tg.name}</span>
      <span class="mod-badge__state">${tg.on ? t('已开启') : t('已关闭')}</span>
    </button>`)}
    ${mod.stale ? html`<button type="button" class="mod-badge mod-badge--reload" title=${t('重新载入游戏数据')}
      onClick=${() => { try { location.reload(); } catch { /* jsdom / tests */ } }}>
      <span class="mod-badge__name">${t('数据已变更')}</span>
      <span class="mod-badge__state">${t('刷新')}</span>
    </button>` : null}
  </div>`;
}
