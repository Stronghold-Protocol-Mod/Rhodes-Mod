// server/match/match/amiya.js — Match methods: the 罗德岛 MOD's g.amiya intent (阿米娅升变任务: pick / claim).
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).
//
// The quest STATE lives in a persistent EffectRef (`modrhodes:amiya-quest`) on the player's ps.effects — created by
// the content-side global handler on the first caster gained (bonds/rhodes.js), its progress folded by the effect's
// onBattleResult. This module only moves the state machine along the player's explicit choices:
//   choose → (pick) → active → (onBattleResult) → ready → (claim) → done
// pick names ONE quest (二选一, locking the route); claim transforms the caster in place (PlayerState.transformChess:
// equipment, summons, pool copies and the tile survive — 突变细胞's machinery), the elite correspondence riding
// (`_b` caster → `_b` form). The ascension also re-faces the claimant's SHOP (2026-10-11 user decision): ps.poolSwap
// makes this player's rolls offer the ascended form wherever they would have offered the 术士 — shelf cards re-face at
// once, and the form's copy accounting (buy / merge / sell / elimination) rides the caster's shared-pool entries
// (diy.js poolOf) — so the form stays quest-only for everyone else and no hidden record ever enters the shared pool. A caster lost after the quest started (sold / destroyed / 突变细胞-ed away) does not
// strand the reward: claim falls back to gaining the form like any effect grant. Prep phases only (the same gate as
// g.unitStats): a transform is board state, never a battle-time action.
//
// Inert while the mod is off: without a caster record no EffectRef is ever created, so every intent fails BAD_TARGET.

import { PHASE, ERR } from '../../../shared/constants.js';
import { MOD_C2S } from '../../../shared/protocol.js';
import { AMIYA_QUESTS, AMIYA_QUEST_EFFECT_ID, AMIYA_C2S, amiyaQuestDone, amiyaQuestTarget, amiyaFormOf, amiyaShopSwap } from '../../../shared/amiyaQuest.js';
import { boardOrder } from '../board.js';
import { OK, fail } from './common.js';

// the MOD's C2S schema, into the framework's neutral registry (Match.js imports this container statically, so the
// server has it from boot — whether the mod is ON or OFF; OFF the intent then answers BAD_TARGET as before)
MOD_C2S['g.amiya'] = AMIYA_C2S;

/** 术士阿米娅 to transform: board reading order, then the hand, then the temp 整备区 (null when none is owned). */
function casterPiece(m, ps) {
  for (const { piece } of boardOrder(ps.board)) {
    if (piece.kind === 'chess' && amiyaFormOf(piece.id) === 'caster') return piece;
  }
  for (const p of ps.hand) if (p && p.kind === 'chess' && amiyaFormOf(p.id) === 'caster') return p;
  for (const p of ps.temp) if (p && p.kind === 'chess' && amiyaFormOf(p.id) === 'caster') return p;
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
    const quest = AMIYA_QUESTS[msg.quest];
    if (!quest) return fail(ERR.BAD_MSG, 'unknown quest');

    if (msg.action === 'pick') {
      if (d.state !== 'choose') return fail(ERR.ALREADY, `quest state ${d.state}`);
      d.state = 'active';
      d.quest = msg.quest;
      // the progress kept accumulating before the pick — a route whose conditions are already met is ready at once
      if (amiyaQuestDone(d, msg.quest)) d.state = 'ready';
      this.toast(ps, 'info', d.state === 'ready'
        ? `已选择升变道路「${quest.name}」——任务已完成，随时可以让阿米娅升变为${quest.formName}`
        : `已选择升变道路「${quest.name}」——完成它即可让阿米娅升变为${quest.formName}`);
      ps.dirty();
      return OK;
    }

    if (msg.action === 'claim') {
      if (d.state !== 'ready' || !amiyaQuestDone(d, d.quest)) return fail(ERR.BAD_TARGET, 'quest not ready');
      const piece = casterPiece(this, ps);
      const target = amiyaQuestTarget(quest, !!(piece && this.gd.isGolden(piece.id)));
      const gained = piece
        ? ps.transformChess(piece, target)
        : ps.acquireChess(target, { source: 'amiya-quest' });
      if (!gained) return fail(ERR.HAND_FULL, 'no room for the gained operator');
      d.state = 'done';
      // the shop follows the ascension (2026-10-11 user decision): this player's shop rolls now offer the ascended
      // form wherever they would have offered the 术士 (ps.poolSwap — economy.js rolls, diy.js poolOf copy
      // accounting), and shelf cards already showing the caster re-face into the form at once (frozen included;
      // sold slots are dead). Other players' shops keep the 术士 — the form stays quest-only for everyone else.
      const swap = amiyaShopSwap(d.quest);
      if (swap) {
        ps.poolSwap = swap;
        for (const s of ps.shop.slots) {
          const to = s && s.kind === 'chess' && !s.sold ? swap.roll.get(s.id) : null;
          if (to) { s.id = to; s.basePrice = this.gd.chessPrice(to); }
        }
      }
      this.toast(ps, 'info', `阿米娅升变为${quest.formName}！商店此后只刷新${quest.formName}的阿米娅`);
      ps.dirty();
      return OK;
    }

    return fail(ERR.BAD_MSG, 'unknown action');
  }
}
