// server/match/match/amiya.js — Match methods: the 罗德岛 MOD's g.amiya intent (阿米娅升变任务: pick / claim).
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).
//
// The quest STATE lives in a persistent EffectRef (`modrhodes:amiya-quest`) on the player's ps.effects — created by
// the content-side global handler on the first caster gained (bonds/rhodes.js), its progress folded by the effect's
// onBattleResult. This module only moves the state machine along, one step at a time:
//   choose → (pick, the FIRST step only) → active → (onBattleResult) → ready → (claim) → active (next step) → … → done
// **The route is a line, not a fork (2026-10-12 user decision)**: 术士 → 近卫 → 医疗. `claim` transforms the piece the
// CURRENT step starts from (`quest.from` — the caster for 〈继承之剑〉, the guard for 〈以伤害的方式拯救〉) in place
// (PlayerState.transformChess: equipment, summons, pool copies and the tile survive — 突变细胞's machinery), the elite
// correspondence riding (`_b` caster → `_b` form), then advances the state (shared/amiyaQuest.js `amiyaAdvance`:
// next step `active` with the counters reset, else `done`). The ascension also re-faces the claimant's SHOP
// (2026-10-11 user decision, cumulative since 2026-10-12): ps.poolSwap makes this player's rolls offer the new form
// wherever they could have offered 术士 **or any earlier form** — shelf cards re-face at once, and every ascended
// form's copy accounting (buy / merge / sell / elimination) rides the 术士's shared-pool entries (diy.js poolOf) — so
// the forms stay quest-only for everyone else and no hidden record ever enters the shared pool. A piece lost after
// the quest started (sold / 突变细胞-ed away) does not strand the reward: claim falls back to gaining the form like
// any effect grant. Prep phases only (the same gate as g.unitStats): a transform is board state, never a battle-time
// action.
//
// Inert while the mod is off: without a caster record no EffectRef is ever created, so every intent fails BAD_TARGET.

import { PHASE, ERR } from '../../../shared/constants.js';
import { MOD_C2S } from '../../../shared/protocol.js';
import { AMIYA_QUESTS, AMIYA_QUEST_EFFECT_ID, AMIYA_C2S, AMIYA_ROUTE, amiyaQuestDone, amiyaQuestTarget, amiyaFormOf, amiyaShopSwap, amiyaAdvance } from '../../../shared/amiyaQuest.js';
import { boardOrder } from '../board.js';
import { OK, fail } from './common.js';

// the MOD's C2S schema, into the framework's neutral registry (Match.js imports this container statically, so the
// server has it from boot — whether the mod is ON or OFF; OFF the intent then answers BAD_TARGET as before)
MOD_C2S['g.amiya'] = AMIYA_C2S;

/** The 阿米娅 of form `form` to transform: board reading order, then the hand, then the temp 整备区 (null when none
 * is owned). `form` is the CURRENT step's origin — 'caster' for 〈继承之剑〉, 'guard' for 〈以伤害的方式拯救〉. */
function pieceOfForm(ps, form) {
  for (const { piece } of boardOrder(ps.board)) {
    if (piece.kind === 'chess' && amiyaFormOf(piece.id) === form) return piece;
  }
  for (const p of ps.hand) if (p && p.kind === 'chess' && amiyaFormOf(p.id) === form) return p;
  for (const p of ps.temp) if (p && p.kind === 'chess' && amiyaFormOf(p.id) === form) return p;
  return null;
}

export class MatchAmiya {
  /**
   * g.amiya { action: 'pick'|'claim', quest: 'blade'|'lamp' } — the 阿米娅升变任务 intents (prep phases only).
   * The state machine lives in the EffectRef's `data` ({ state, quest, dmg, heal }, shared/amiyaQuest.js).
   * @param {import('../PlayerState.js').PlayerState} ps
   * @param {{ action?: string, quest?: string }} msg
   */
  amiyaQuest(ps, msg) {
    if (!ps.alive) return fail(ERR.ELIMINATED);
    if (this.phase !== PHASE.ROUND_START && this.phase !== PHASE.SP_DRAFT && this.phase !== PHASE.PREP) return fail(ERR.WRONG_PHASE);
    const ref = ps.effects.find((e) => e && e.id === AMIYA_QUEST_EFFECT_ID);
    const d = ref && ref.data;
    if (!d) return fail(ERR.BAD_TARGET, 'no ascension quest');
    if (!AMIYA_QUESTS[msg.quest]) return fail(ERR.BAD_MSG, 'unknown quest');

    if (msg.action === 'pick') {
      if (d.state !== 'choose') return fail(ERR.ALREADY, `quest state ${d.state}`);
      // the line starts at ONE place: only the first step is ever open, so only it may be picked (later steps arm
      // themselves on claim — amiyaAdvance)
      if (msg.quest !== AMIYA_ROUTE[0]) return fail(ERR.BAD_MSG, `the first step is ${AMIYA_ROUTE[0]}`);
      const quest = AMIYA_QUESTS[msg.quest];
      d.state = 'active';
      d.quest = msg.quest;
      // the progress kept accumulating before the pick — a step whose conditions are already met is ready at once
      if (amiyaQuestDone(d, msg.quest)) d.state = 'ready';
      this.toast(ps, 'info', d.state === 'ready'
        ? `已选择升变道路「${quest.name}」——任务已完成，随时可以让阿米娅升变为${quest.formName}`
        : `已踏上升变之路「${quest.name}」——第一步：让阿米娅成为${quest.formName}`);
      ps.dirty();
      return OK;
    }

    if (msg.action === 'claim') {
      // the CURRENT step is the authority; the message's quest is only echoed back by the panel, never trusted
      const quest = AMIYA_QUESTS[d.quest];
      if (!quest || msg.quest !== d.quest) return fail(ERR.BAD_MSG, 'unknown quest');
      if (d.state !== 'ready' || !amiyaQuestDone(d, d.quest)) return fail(ERR.BAD_TARGET, 'quest not ready');
      const piece = pieceOfForm(ps, quest.from);
      const target = amiyaQuestTarget(quest, !!(piece && this.gd.isGolden(piece.id)));
      const gained = piece
        ? ps.transformChess(piece, target)
        : ps.acquireChess(target, { source: 'amiya-quest' });
      if (!gained) return fail(ERR.HAND_FULL, 'no room for the gained operator');
      // the line moves on: the next step arms itself (counters reset) or the quest ends (amiyaAdvance)
      amiyaAdvance(d);
      // the shop follows the ascension (2026-10-11 user decision, cumulative along the line): this player's shop
      // rolls now offer the NEW form wherever they could have offered 术士 or any earlier form (ps.poolSwap —
      // economy.js rolls, diy.js poolOf copy accounting), and shelf cards already showing one of those re-face into
      // it at once (frozen included; sold slots are dead). Other players' shops keep the 术士.
      const swap = amiyaShopSwap(quest.id);
      if (swap) {
        ps.poolSwap = swap;
        for (const s of ps.shop.slots) {
          const to = s && s.kind === 'chess' && !s.sold ? swap.roll.get(s.id) : null;
          if (to) { s.id = to; s.basePrice = this.gd.chessPrice(to); }
        }
      }
      const next = d.state === 'active' ? AMIYA_QUESTS[d.quest] : null;
      this.toast(ps, 'info', next
        ? `阿米娅升变为${quest.formName}！升变之路还有下一段：〈${next.name}〉——商店此后只刷新${quest.formName}的阿米娅`
        : `阿米娅升变为${quest.formName}！本局的升变之路到此完成——商店此后只刷新${quest.formName}的阿米娅`);
      ps.dirty();
      return OK;
    }

    return fail(ERR.BAD_MSG, 'unknown action');
  }
}
