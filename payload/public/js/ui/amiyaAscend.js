// public/js/ui/amiyaAscend.js — the 罗德岛 MOD's 阿米娅升变面板 (shared/amiyaQuest.js is the contract).
//
// The server owns the quest STATE: the first caster (`chess_rhodes_amiya`) a player gains in a match opens a persistent
// EffectRef (`modrhodes:amiya-quest`) whose `data` ({ state, quest, dmg, heal }) rides m.private.effects[].data
// (effectsView's passthrough). This module only RENDERS that state and sends the two intents the state machine knows:
//   choose → (g.amiya pick, 二选一, locks the route) → active → (the server folds every battle result) → ready
//          → (g.amiya claim, 手动升变 — transformChess in place) → done
// User design 2026-10-09: the panel AUTO-OPENS when the quest appears (局内第一次购买阿米娅) and again when a quest
// completes; between the two it waits behind its own corner button. The 〈继承之剑〉(→ 近卫) / 〈以伤害的方式拯救〉
// (→ 医疗) cards show the conditions and the live progress; the numbers are the mod's own (shared/amiyaQuest.js).
//
// Mount contract (the FRAMEWORK's, not a mod's): `client: "js/ui/amiyaAscend.js"` in mod/toggles.d/rhodes.json —
// ui/modBadge.js imports this module while the mod is ON and calls mount(); the returned cleanup unmounts it.
// Inert while the mod is OFF at both ends: the module is never mounted, and no effect of this id ever arrives.
//
// CSS is injected by mount() (a single <style>, module-scoped class names `amyq-*`) — the panel patches no
// index.html / theme.css of the framework.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { render } from '../../vendor/preact.module.js';
import { html, Modal } from './components.js';
import { toast } from './toasts.js';
import { net } from '../net.js';
import { selectRoute, store, useStore, shallowEqual } from '../store.js';
import { t } from '../../../shared/i18n.js';
import { MOD_C2S } from '../../../shared/protocol.js';
import { AMIYA_QUEST_EFFECT_ID, AMIYA_QUESTS, AMIYA_C2S, amiyaQuestRemaining } from '../../../shared/amiyaQuest.js';

// the client half of the MOD_C2S registration (net.js validates every outgoing message): this module is what sends
// g.amiya, and modBadge imports it before the panel exists, so the schema is always in before the first send
MOD_C2S['g.amiya'] = AMIYA_C2S;

/** The store selector: the quest `data` of this player's own private view (null outside a match / without the quest). */
export const selectAmiyaQuest = (s) => {
  const eff = s.match && s.match.private && s.match.private.effects;
  if (!Array.isArray(eff)) return null;
  const e = eff.find((x) => x && x.id === AMIYA_QUEST_EFFECT_ID);
  return e && e.data && typeof e.data === 'object' ? e.data : null;
};

/** g.amiya with a toast on refusal (the server's error text is already the player-facing wording). */
async function sendAmiya(action, quest) {
  try {
    await net.request('g.amiya', { action, quest });
    return true;
  } catch (e) {
    toast(e && e.message ? e.message : t('请求失败'), 'warn');
    return false;
  }
}

/** One quest card: name, conditions, live progress, the pick button (choose state) / the marker of the picked route. */
function QuestCard({ quest, d, picked, onPick, busy }) {
  const left = amiyaQuestRemaining(d, quest.id);
  const met = left.dmg <= 0 && left.heal <= 0;
  const line = (label, need, leftv) => html`<div class=${`amyq-cond${leftv <= 0 ? ' is-met' : ''}`}>
    <span class="amyq-cond__label">${label}</span>
    <span class="amyq-cond__bar" aria-hidden="true"><i style=${`width:${Math.min(100, Math.round(((need - Math.max(0, leftv)) / need) * 100))}%`}></i></span>
    <span class="amyq-cond__num num">${need - Math.max(0, leftv)} / ${need}</span>
  </div>`;
  return html`<div class=${`amyq-card${picked ? ' is-picked' : ''}${met && picked ? ' is-met' : ''}`}>
    <div class="amyq-card__head">
      <b class="amyq-card__name">〈${quest.name}〉</b>
      <span class="amyq-card__form">${t('奖励：术士形态 → {form}', { form: quest.formName })}</span>
    </div>
    <p class="amyq-card__text">
      ${quest.id === 'blade'
        ? t('阿米娅本人累计造成 {dmg} 点伤害。（继承奎隆之剑——争斗在此止歇。）', { dmg: quest.dmg })
        : t('阿米娅本人累计造成 {dmg} 点伤害，且全队累计治疗 {heal} 点。（以战斗的方式治愈，以伤害的方式拯救。）', { dmg: quest.dmg, heal: quest.heal })}
    </p>
    ${line(t('阿米娅伤害'), quest.dmg, left.dmg)}
    ${quest.heal > 0 ? line(t('全队治疗'), quest.heal, left.heal) : null}
    ${picked
      ? html`<div class=${`amyq-card__mark${met ? ' is-ready' : ''}`}>${met ? t('任务完成——可以升变') : t('进行中')}</div>`
      : html`<button type="button" class="amyq-card__pick" disabled=${busy} onClick=${onPick}>${t('选择此路')}</button>`}
  </div>`;
}

/** The modal body per state. */
function QuestPanel({ d, onClose }) {
  const [busy, setBusy] = useState(false);
  const guard = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  if (!d) return null;

  if (d.state === 'choose') {
    return html`<div class="amyq-choose">
      <p class="amyq-lead">${t('术士形态的阿米娅已加入你的编队。两条道路只能选择其一——选定后不可更改：')}</p>
      <div class="amyq-cards">
        ${Object.values(AMIYA_QUESTS).map((q) => html`<${QuestCard} key=${q.id} quest=${q} d=${d} busy=${busy}
          onPick=${() => guard(async () => { if (await sendAmiya('pick', q.id)) onClose(); })} />`)}
      </div>
      <p class="amyq-note">${t('阿米娅本人的伤害与全队的治疗会一直累计，无论先选还是后选——选好的道路会立刻检查完成条件。')}</p>
    </div>`;
  }

  const q = AMIYA_QUESTS[d.quest];
  if (!q) return null;
  const left = amiyaQuestRemaining(d, d.quest);
  const ready = d.state === 'ready';
  if (d.state === 'done') {
    return html`<div class="amyq-done">
      <p class="amyq-lead">${t('阿米娅已升变为{form}。本局的任务到此完成。', { form: q.formName })}</p>
      <div class="amyq-actions"><button type="button" class="amyq-btn" onClick=${onClose}>${t('关闭')}</button></div>
    </div>`;
  }
  return html`<div class="amyq-active">
    <p class="amyq-lead">
      ${ready
        ? t('任务「{name}」已完成！点击升变，让场上的／手中的术士阿米娅成为{form}。', { name: q.name, form: q.formName })
        : t('当前道路：〈{name}〉——完成后即可让阿米娅升变为{form}。', { name: q.name, form: q.formName })}
    </p>
    <${QuestCard} quest=${q} d=${d} picked=${true} busy=${busy} onPick=${() => {}} />
    <div class="amyq-actions">
      <button type="button" class=${`amyq-btn${ready ? ' is-primary' : ''}`} disabled=${!ready || busy}
        onClick=${() => guard(async () => { if (await sendAmiya('claim', q.id)) onClose(); })}>
        ${ready ? t('升变！') : t('任务未完成')}
      </button>
      <button type="button" class="amyq-btn" onClick=${onClose}>${t('稍后')}</button>
    </div>
    ${!ready ? html`<p class="amyq-note">${t('升变在休整期进行：场上、手牌或整备区中的术士阿米娅会原地成为{form}（装备、站位与精锐阶都保留）。', { form: q.formName })}</p>` : null}
  </div>`;
}

/** The corner button (bottom-left, out of the effects column's way) + the modal. */
function AmiyaAscendHost() {
  const route = useStore(selectRoute);
  const d = useStore(selectAmiyaQuest, shallowEqual);
  const [open, setOpen] = useState(false);
  const seen = useRef(null);
  // auto-open: the quest's first appearance (首次购买阿米娅) and every transition into `ready`
  useEffect(() => {
    const key = d ? `${d.state}:${d.quest ?? ''}` : null;
    if (key && seen.current !== key) {
      const prev = seen.current;
      seen.current = key;
      if (prev === null || (d && d.state === 'ready')) setOpen(true);
    }
    if (!d) seen.current = null;
  }, [d]);
  if (route !== 'game' || !d) return null;
  return html`<div class="amyq-root">
    ${d.state !== 'done' ? html`<button type="button" class=${`amyq-tab${d.state === 'ready' ? ' is-ready' : ''}`}
      title=${t('阿米娅的升变')} onClick=${() => setOpen(true)}>
      <span class="amyq-tab__dot" aria-hidden="true"></span>${t('阿米娅的升变')}
      ${d.state === 'ready' ? html`<b class="amyq-tab__n">!</b>` : null}
    </button>` : null}
    <${Modal} open=${open} onClose=${() => setOpen(false)} width="min(92vw, 720px)"
      title=${t('阿米娅的升变')} micro="AMIYA ASCENSION" closeOnBackdrop=${false}>
      <${QuestPanel} d=${d} onClose=${() => setOpen(false)} />
    <//>
  </div>`;
}

const CSS = `
.amyq-root{position:fixed;left:calc(var(--pad,16px) + 4px);bottom:calc(var(--pad,16px) + 56px);z-index:var(--z-modal,900);}
.amyq-tab{display:inline-flex;align-items:center;gap:.4em;padding:.45em .9em;border:1px solid color-mix(in srgb,var(--c-accent,#7ce0c3) 45%,transparent);
  border-radius:999px;background:color-mix(in srgb,var(--c-bg,#10231f) 82%,transparent);color:var(--c-text,#d9efe7);
  font-size:.85rem;letter-spacing:.08em;cursor:pointer;backdrop-filter:blur(6px);}
.amyq-tab:hover{border-color:var(--c-accent,#7ce0c3);}
.amyq-tab__dot{width:.5em;height:.5em;border-radius:50%;background:var(--c-accent,#7ce0c3);opacity:.8;}
.amyq-tab.is-ready{border-color:#ffd479;color:#ffd479;animation:amyq-pulse 1.6s ease-in-out infinite;}
.amyq-tab.is-ready .amyq-tab__dot{background:#ffd479;}
.amyq-tab__n{margin-left:.15em;font-weight:700;}
@keyframes amyq-pulse{50%{box-shadow:0 0 12px color-mix(in srgb,#ffd479 55%,transparent);}}
.amyq-lead{margin:.2em 0 .9em;font-size:.95rem;line-height:1.6;color:var(--c-text,#d9efe7);}
.amyq-note{margin:.9em 0 0;font-size:.78rem;line-height:1.55;opacity:.65;}
.amyq-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:.8em;}
.amyq-card{display:flex;flex-direction:column;gap:.55em;padding:.9em 1em;border:1px solid color-mix(in srgb,var(--c-text,#d9efe7) 16%,transparent);
  border-radius:10px;background:color-mix(in srgb,var(--c-text,#d9efe7) 4%,transparent);}
.amyq-card.is-picked{border-color:color-mix(in srgb,var(--c-accent,#7ce0c3) 55%,transparent);}
.amyq-card.is-met{border-color:#ffd479;}
.amyq-card__head{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5em;}
.amyq-card__name{font-size:1.02rem;color:var(--c-accent,#7ce0c3);}
.amyq-card__form{font-size:.78rem;opacity:.75;}
.amyq-card__text{margin:0;font-size:.82rem;line-height:1.6;opacity:.85;}
.amyq-cond{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.6em;font-size:.78rem;}
.amyq-cond__num{opacity:.85;}
.amyq-cond__bar{height:.32em;border-radius:999px;background:color-mix(in srgb,var(--c-text,#d9efe7) 12%,transparent);overflow:hidden;}
.amyq-cond__bar i{display:block;height:100%;background:var(--c-accent,#7ce0c3);transition:width .4s ease;}
.amyq-cond.is-met .amyq-cond__bar i{background:#ffd479;}
.amyq-card__pick{align-self:flex-start;padding:.4em 1.1em;border:1px solid color-mix(in srgb,var(--c-accent,#7ce0c3) 55%,transparent);
  border-radius:6px;background:transparent;color:var(--c-accent,#7ce0c3);font-size:.85rem;letter-spacing:.1em;cursor:pointer;}
.amyq-card__pick:hover:not(:disabled){background:color-mix(in srgb,var(--c-accent,#7ce0c3) 16%,transparent);}
.amyq-card__pick:disabled{opacity:.45;cursor:default;}
.amyq-card__mark{font-size:.8rem;letter-spacing:.12em;opacity:.75;}
.amyq-card__mark.is-ready{color:#ffd479;opacity:1;}
.amyq-actions{display:flex;gap:.7em;margin-top:1em;}
.amyq-btn{padding:.5em 1.4em;border:1px solid color-mix(in srgb,var(--c-text,#d9efe7) 28%,transparent);border-radius:6px;
  background:transparent;color:var(--c-text,#d9efe7);font-size:.9rem;letter-spacing:.1em;cursor:pointer;}
.amyq-btn:hover:not(:disabled){border-color:var(--c-text,#d9efe7);}
.amyq-btn.is-primary{border-color:#ffd479;color:#ffd479;}
.amyq-btn.is-primary:hover:not(:disabled){background:color-mix(in srgb,#ffd479 14%,transparent);}
.amyq-btn:disabled{opacity:.4;cursor:default;}
`;

/** Inject the panel's stylesheet once (dev harnesses; the module never touches index.html). */
export function ensureAmiyaCss(doc = globalThis.document) {
  if (!doc?.head || typeof doc.querySelector !== 'function') return false;
  if (doc.querySelector('style[data-amiya-ascend]')) return false;
  const el = doc.createElement('style');
  el.setAttribute('data-amiya-ascend', '');
  el.textContent = CSS;
  doc.head.appendChild(el);
  return true;
}

/**
 * Mount the panel — the mod-client contract (mod/toggles.d/rhodes.json `client`). Self-contained: own container on
 * <body>, own <style>; renders nothing outside a match / while the quest effect is absent (mod OFF).
 * @returns {() => void} the cleanup
 */
export function mount() {
  ensureAmiyaCss();
  const doc = globalThis.document;
  if (!doc || !doc.body) return () => {}; // a headless / pre-body context: mount nothing, never throw
  const host = doc.createElement('div');
  host.className = 'amyq-host';
  doc.body.appendChild(host);
  render(html`<${AmiyaAscendHost} />`, host);
  return () => { try { render(null, host); } catch { /* jsdom / already gone */ } host.remove(); };
}

/** Diagnostics: the raw quest state of the current session (tests / console). */
export function amiyaQuestState() {
  const d = selectAmiyaQuest(store.get());
  return d ? { ...d } : null;
}
