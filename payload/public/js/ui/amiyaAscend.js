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

// Amiya's own marks (user design 2026-10-11: the panel should feel like HERS, not like the firm's HUD) — a thin gold
// halo above two long ears as the crest, and one small mark per path: the blade she inherits, the ring she heals by.
const CREST = html`<svg class="amyq-crest" viewBox="0 0 120 84" aria-hidden="true">
  <ellipse cx="60" cy="12" rx="20" ry="5.5" fill="none" stroke="currentColor" stroke-width="3" />
  <path d="M45 84 C36 62 33 36 42 24 C49 15 57 19 56 33 C55 53 51 71 50 84 Z" fill="currentColor" opacity=".8" />
  <path d="M75 84 C84 62 87 36 78 24 C71 15 63 19 64 33 C65 53 69 71 70 84 Z" fill="currentColor" opacity=".4" />
</svg>`;
const MARK_BLADE = html`<svg class="amyq-mark" viewBox="0 0 24 24" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M19.4 4.6 9.9 14.1" />
    <path d="M12.1 16.7 7.3 11.9" />
    <path d="M8.3 15.7 4.6 19.4" />
  </g>
  <path d="M19.8 4.2l-3.5.5 3 3z" fill="currentColor" />
</svg>`;
const MARK_LAMP = html`<svg class="amyq-mark" viewBox="0 0 24 24" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 8.2v7.6M8.2 12h7.6" />
  </g>
</svg>`;
const QUEST_MARK = { blade: MARK_BLADE, lamp: MARK_LAMP };

/** Overall progress of a route as 0–1: what is left of both conditions against their goal sizes (dmg and heal only
 *  ever accumulate, so the bar never goes backwards; it reads 100% exactly when the route is done). */
function questProgress(d, questId) {
  const q = AMIYA_QUESTS[questId];
  if (!q || !d) return 0;
  const left = amiyaQuestRemaining(d, questId);
  const total = q.dmg + q.heal;
  return total ? Math.min(1, Math.max(0, (total - left.dmg - left.heal) / total)) : 0;
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
  return html`<div class=${`amyq-card amyq-card--${quest.id}${picked ? ' is-picked' : ''}${met && picked ? ' is-met' : ''}`}>
    <div class="amyq-card__head">
      <span class="amyq-card__mark-badge" aria-hidden="true">${QUEST_MARK[quest.id] || MARK_LAMP}</span>
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
      ${CREST}
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
  const p = questProgress(d, d.quest);
  const progress = html`<div class=${`amyq-progress${ready ? ' is-ready' : ''}`}>
    <div class="amyq-progress__head">
      <span class="amyq-progress__label">${ready ? t('可以升变') : t('升变进度')}</span>
      <span class="amyq-progress__pct num">${Math.round(p * 100)}%</span>
    </div>
    <div class="amyq-progress__bar" role="progressbar" aria-valuenow=${Math.round(p * 100)} aria-valuemin="0" aria-valuemax="100">
      <i style=${`width:${Math.round(p * 100)}%`}></i>
    </div>
  </div>`;
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
    ${progress}
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
      ${d.quest ? html`<span class="amyq-tab__line" aria-hidden="true"><i style=${`width:${Math.round(questProgress(d, d.quest) * 100)}%`}></i></span>` : null}
    </button>` : null}
    <${Modal} open=${open} onClose=${() => setOpen(false)}
      width=${d.state === 'choose' ? 'min(92vw, 7.4rem)' : 'min(92vw, 5.6rem)'}
      tone="gold"
      title=${t('阿米娅的升变')} micro="AMIYA ASCENSION" closeOnBackdrop=${false}>
      <${QuestPanel} d=${d} onClose=${() => setOpen(false)} />
    <//>
  </div>`;
}

const CSS = `
/* Text sizes follow the game's TEXT root (--t): 1rem here is the LAYOUT root (~100px at 1080p) — never a font size.
   Palette: Amiya's warm gold instead of the firm's terminal mint; each path keeps a tint of its own. */
.amyq-root{--amyq-gold:#f0c96a;--amyq-gold-hi:#ffd98f;--amyq-blade:#eda36b;--amyq-lamp:#9fd6c0;
  position:fixed;left:calc(var(--pad,16px) + 4px);bottom:calc(var(--pad,16px) + 56px);z-index:var(--z-modal,900);}
.amyq-tab{position:relative;display:inline-flex;align-items:center;gap:.4em;padding:.45em .9em;border:1px solid color-mix(in srgb,var(--amyq-gold,#f0c96a) 40%,transparent);
  border-radius:999px;background:color-mix(in srgb,#241f19 82%,transparent);color:#efe6d2;
  font-size:calc(.13 * var(--t));letter-spacing:.08em;cursor:pointer;backdrop-filter:blur(6px);overflow:hidden;}
.amyq-tab:hover{border-color:var(--amyq-gold,#f0c96a);}
.amyq-tab__dot{width:.5em;height:.5em;border-radius:50%;background:var(--amyq-gold,#f0c96a);opacity:.8;}
.amyq-tab.is-ready{color:var(--amyq-gold-hi,#ffd98f);animation:amyq-pulse 1.6s ease-in-out infinite;}
.amyq-tab.is-ready .amyq-tab__dot{background:var(--amyq-gold-hi,#ffd98f);}
.amyq-tab__n{margin-left:.15em;font-weight:700;}
.amyq-tab__line{position:absolute;left:14%;right:14%;bottom:3px;height:2px;border-radius:999px;
  background:color-mix(in srgb,#efe6d2 18%,transparent);overflow:hidden;}
.amyq-tab__line i{display:block;height:100%;background:var(--amyq-gold,#f0c96a);transition:width .4s ease;}
.amyq-tab.is-ready .amyq-tab__line i{background:var(--amyq-gold-hi,#ffd98f);}
.amyq-progress{margin:.1rem 0 .02rem;}
.amyq-progress__head{display:flex;align-items:baseline;justify-content:space-between;gap:.6em;margin-bottom:.06em;}
.amyq-progress__label{font-size:calc(.13 * var(--t));letter-spacing:.14em;opacity:.75;}
.amyq-progress__pct{font-size:calc(.15 * var(--t));color:var(--amyq-gold-hi,#ffd98f);}
.amyq-progress__bar{height:.09rem;border-radius:999px;background:color-mix(in srgb,#efe6d2 12%,transparent);overflow:hidden;}
.amyq-progress__bar i{display:block;height:100%;border-radius:999px;transition:width .4s ease;
  background:linear-gradient(90deg,color-mix(in srgb,var(--amyq-blade,#eda36b) 80%,var(--amyq-gold,#f0c96a)),var(--amyq-gold,#f0c96a));}
.amyq-progress.is-ready .amyq-progress__bar i{background:var(--amyq-gold-hi,#ffd98f);animation:amyq-pulse 1.6s ease-in-out infinite;}
@keyframes amyq-pulse{50%{box-shadow:0 0 12px color-mix(in srgb,var(--amyq-gold,#f0c96a) 55%,transparent);}}
.amyq-choose{position:relative;z-index:0;}
.amyq-crest{position:absolute;top:-.04rem;right:.08rem;width:.74rem;height:auto;color:var(--amyq-gold,#f0c96a);opacity:.28;pointer-events:none;z-index:-1;}
.amyq-lead{margin:.2em 0 .12rem;padding-left:.12rem;border-left:2px solid color-mix(in srgb,var(--amyq-gold,#f0c96a) 65%,transparent);
  font-size:calc(.16 * var(--t));line-height:1.6;color:var(--text-hi,#f2ede2);}
.amyq-note{margin:.12rem 0 0;font-size:calc(.125 * var(--t));line-height:1.55;opacity:.6;}
.amyq-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(2.9rem,1fr));gap:.12rem;margin-top:.12rem;}
.amyq-card{position:relative;display:flex;flex-direction:column;gap:.1rem;padding:.14rem .16rem;border-radius:12px;
  border:1px solid color-mix(in srgb,var(--path,#f0c96a) 34%,transparent);
  background:linear-gradient(160deg,color-mix(in srgb,var(--path,#f0c96a) 9%,transparent),color-mix(in srgb,#f0c96a 3%,transparent));}
.amyq-card--blade{--path:var(--amyq-blade,#eda36b);}
.amyq-card--lamp{--path:var(--amyq-lamp,#9fd6c0);}
.amyq-card.is-picked{border-color:color-mix(in srgb,var(--path,#f0c96a) 62%,transparent);box-shadow:0 0 .14rem color-mix(in srgb,var(--path,#f0c96a) 18%,transparent);}
.amyq-card.is-met{--path:var(--amyq-gold,#f0c96a);border-color:color-mix(in srgb,var(--amyq-gold,#f0c96a) 70%,transparent);}
.amyq-card__head{display:flex;flex-wrap:wrap;align-items:center;gap:.4em;}
.amyq-card__mark-badge{display:inline-flex;width:calc(.2 * var(--t));height:calc(.2 * var(--t));color:var(--path,#f0c96a);}
.amyq-card__mark-badge .amyq-mark{width:100%;height:100%;}
.amyq-card__name{font-size:calc(.17 * var(--t));color:var(--path,#f0c96a);}
.amyq-card__form{font-size:calc(.12 * var(--t));opacity:.7;}
.amyq-card__text{margin:0;font-size:calc(.14 * var(--t));line-height:1.65;opacity:.85;}
.amyq-cond{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.6em;font-size:calc(.14 * var(--t));}
.amyq-cond__num{opacity:.85;}
.amyq-cond__bar{height:.32em;border-radius:999px;background:color-mix(in srgb,var(--text-hi,#f2ede2) 12%,transparent);overflow:hidden;}
.amyq-cond__bar i{display:block;height:100%;background:var(--path,#f0c96a);transition:width .4s ease;}
.amyq-cond.is-met .amyq-cond__bar i{background:var(--amyq-gold,#f0c96a);}
.amyq-card__pick{align-self:flex-start;padding:.4em 1.2em;border:1px solid color-mix(in srgb,var(--path,#f0c96a) 60%,transparent);
  border-radius:999px;background:transparent;color:var(--path,#f0c96a);font-size:calc(.14 * var(--t));letter-spacing:.1em;cursor:pointer;}
.amyq-card__pick:hover:not(:disabled){background:color-mix(in srgb,var(--path,#f0c96a) 14%,transparent);}
.amyq-card__pick:disabled{opacity:.45;cursor:default;}
.amyq-card__mark{font-size:calc(.13 * var(--t));letter-spacing:.12em;opacity:.7;}
.amyq-card__mark.is-ready{color:var(--amyq-gold-hi,#ffd98f);opacity:1;}
.amyq-actions{display:flex;gap:.1rem;margin-top:.14rem;}
.amyq-btn{padding:.45em 1.4em;border:1px solid color-mix(in srgb,var(--text-hi,#f2ede2) 26%,transparent);border-radius:999px;
  background:transparent;color:var(--text-hi,#f2ede2);font-size:calc(.15 * var(--t));letter-spacing:.1em;cursor:pointer;}
.amyq-btn:hover:not(:disabled){border-color:var(--text-hi,#f2ede2);}
.amyq-btn.is-primary{border-color:var(--amyq-gold,#f0c96a);color:var(--amyq-gold-hi,#ffd98f);}
.amyq-btn.is-primary:hover:not(:disabled){background:color-mix(in srgb,var(--amyq-gold,#f0c96a) 13%,transparent);}
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
