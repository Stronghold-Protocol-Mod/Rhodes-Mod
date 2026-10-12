// shared/amiyaQuest.js — 阿米娅升变任务（罗德岛 MOD）的共享定义与纯函数。
//
// 两端共用：服务端的内容注册（server/sim/content/bonds/rhodes.js 的 meta handler）负责「局内首次获得术士阿米娅
// → 建立任务、战斗结算累计进度」，g.amiya 意图（server/match/match/amiya.js）负责「启程 / 点升变」；客户端的
// 升变面板（public/js/ui/amiyaAscend.js，罗德岛 mod 的 client 自挂载）从 m.private 的 effects[].data 读同一份
// 状态渲染。数字是 mod 自己的设计定案（2026-10-09 用户决策），不是官方数据。
//
// **升变是一条单行线（2026-10-12 用户决策）**：术士 → 近卫 → 医疗，一步一段，没有分支。术士只能先成为近卫，
// 近卫只能再成为医疗；每一段有它自己的任务条件，claim 后**下一段自动开启**（没有「二选一」，也没有回头路）：
//   〈继承之剑〉(blade)：阿米娅本人累计造成 8000 点伤害 → 术士 → 近卫形态（char_1001_amiya2，奎隆之剑「争斗在此止歇」）
//   〈以伤害的方式拯救〉(lamp)：阿米娅本人累计 6000 点伤害 且 全队累计治疗 8000 点 → 近卫 → 医疗形态
//                               （char_1037_amiya3，「以战斗的方式治愈，以伤害的方式拯救」）
// 两段的 dmg / heal 计数**各自计量**：claim 时清零（amiyaAdvance），否则第二段的 6000 / 8000 会被第一段已经攒够的
// 伤害直接越过。进度来自 onBattleResult 的 result.unitStats（逐单位 defId/dmg）与 result.healingDone，所以升变 /
// 合并后的阿米娅继续计数（任何 chess_rhodes_amiya 系的 defId 都算「阿米娅本人」）。
//
// 三形态价格统一为 3（pay once, transform free）：术士在商店可买，近卫 / 医疗 isHidden（GameData.visibleChess
// 过滤出商店），只能由本任务升变获得。

export const AMIYA_CASTER = 'chess_rhodes_amiya';
export const AMIYA_GUARD = 'chess_rhodes_amiya2';
export const AMIYA_MEDIC = 'chess_rhodes_amiya3';

/** The persistent EffectRef the quest state lives in (m.private effects[].data). */
export const AMIYA_QUEST_EFFECT_ID = 'modrhodes:amiya-quest';
export const AMIYA_QUEST_EFFECT_KEY = 'effect:modautochess_amiya_quest';

/** The g.amiya message schema. shared/protocol.js carries only the author's intents; a MOD registers its own through
 * the framework's MOD_C2S registry at import time — server/match/match/amiya.js on the server (always imported via
 * Match.js), this panel's module on the client (loaded by modBadge before the panel can send anything). */
export const AMIYA_C2S = Object.freeze({
  action: (v) => v === 'pick' || v === 'claim',
  quest: (v) => v === 'blade' || v === 'lamp',
});

/**
 * The ascension is a LINE, not a fork (2026-10-12 user decision): 术士 → 近卫 → 医疗, one quest per step. `blade` is
 * the only step the shop form can start; `lamp` opens the instant `blade` is claimed (`amiyaAdvance`). The panel
 * renders only the step the state machine is on, so the old 二选一 screen is gone.
 */
export const AMIYA_ROUTE = Object.freeze(['blade', 'lamp']);

/** The two steps of the route. `from` / `fromName` name the FORM the step starts from (the piece `claim` transforms);
 * form ids are the FULL record ids (this dataset's `baseId` IS the `_a` id — gamedata baseIdOf returns the normal
 * variant, never the suffix-less family). The elite correspondence is explicit. */
export const AMIYA_QUESTS = Object.freeze({
  blade: Object.freeze({ id: 'blade', name: '继承之剑', from: 'caster', fromName: '术士形态', form: 'chess_rhodes_amiya2_a', formGolden: 'chess_rhodes_amiya2_b', formName: '近卫形态', dmg: 8000, heal: 0 }),
  lamp: Object.freeze({ id: 'lamp', name: '以伤害的方式拯救', from: 'guard', fromName: '近卫形态', form: 'chess_rhodes_amiya3_a', formGolden: 'chess_rhodes_amiya3_b', formName: '医疗形态', dmg: 6000, heal: 8000 }),
});

export const AMIYA_QUEST_FORMS = Object.freeze([AMIYA_CASTER, AMIYA_GUARD, AMIYA_MEDIC]);

/** The form families in route order — index i is the form a step at index i-1 ascends INTO (`AMIYA_ROUTE[0]`'s reward
 * is `FORM_FAMILY[1]`). Derived from the quests so the chain can never drift from `AMIYA_ROUTE`. */
const FORM_FAMILY = Object.freeze([
  AMIYA_CASTER,
  ...AMIYA_ROUTE.map((id) => AMIYA_QUESTS[id].form.replace(/_[ab]$/, '')),
]);

/** The route step a player is offered first (the only one `pick` accepts while the quest is `choose`). */
export function amiyaFirstQuest() {
  return AMIYA_ROUTE[0];
}

/** Index of `questId` in the route (-1 when unknown). */
export function amiyaQuestStage(questId) {
  return AMIYA_ROUTE.indexOf(questId);
}

/** The step that follows `questId` (null when it is the last one). */
export function amiyaNextQuest(questId) {
  const i = AMIYA_ROUTE.indexOf(questId);
  return i >= 0 ? AMIYA_ROUTE[i + 1] ?? null : null;
}

/** Any of the three forms, normal or elite (`_a`/`_b`). */
export function isAmiyaChessId(id) {
  return typeof id === 'string' && AMIYA_QUEST_FORMS.some((f) => id === f || id.startsWith(`${f}_`));
}

/** Which Amiya form `id` is: 'caster' | 'guard' | 'medic' | null. The `_2`/`_3` tails make the family prefixes
 * unambiguous (`chess_rhodes_amiya_a` is the caster's, `chess_rhodes_amiya2_a` the guard's). */
export function amiyaFormOf(id) {
  if (!isAmiyaChessId(id)) return null;
  if (id === AMIYA_GUARD || id.startsWith(`${AMIYA_GUARD}_`)) return 'guard';
  if (id === AMIYA_MEDIC || id.startsWith(`${AMIYA_MEDIC}_`)) return 'medic';
  return 'caster';
}

/** The form record the reward grants: the elite variant when `golden` (an elite caster transforms into an elite form). */
export function amiyaQuestTarget(quest, golden) {
  const q = typeof quest === 'string' ? AMIYA_QUESTS[quest] : quest;
  return golden ? q.formGolden : q.form;
}

/**
 * The per-player shop swap an ascension installs (ps.poolSwap, server/match/match/amiya.js — 2026-10-11 user
 * decision): after the claim this player's shop offers the ascended form wherever it would have offered an earlier
 * one — the same shared-pool copies wearing the new body, so nobody else's shop changes and the forms stay unbuyable
 * for anyone who has not finished the quest. `roll` rewrites what a roll drew; `pool` routes the form's copy
 * accounting (take / give / has / left — diy.js poolOf) back to the 术士's shared-pool entry, so buy / merge / sell /
 * elimination never touches a hidden record.
 *
 * **Cumulative along the line (2026-10-12)**: the chain is 术士 → 近卫 → 医疗, so the second claim has to catch BOTH
 * the 术士 cards a shop that never ascended could show AND the 近卫 cards a shop that finished step one is showing —
 * every form at or before the claimed step re-faces into the new one, and every copy of every ascended form is
 * accounted on the 术士's entry (a leftover 近卫 copy bought after step one must still sell back into it). Both
 * directions cover normal and elite defensively (only `_a` ids are ever rolled or keyed: `_b` records are isGolden
 * and live outside the pool).
 * @param {string} questId
 * @returns {{ quest: string, roll: Map<string, string>, pool: Map<string, string> } | null}
 */
export function amiyaShopSwap(questId) {
  const stage = AMIYA_ROUTE.indexOf(questId);
  if (stage < 0) return null;
  const to = FORM_FAMILY[stage + 1];
  const roll = new Map();
  const pool = new Map();
  for (const v of ['a', 'b']) {
    const target = `${to}_${v}`;
    // every form the shop could still be showing (this step's origin and all before it) re-faces into the new one
    for (let i = 0; i <= stage; i++) {
      const from = `${FORM_FAMILY[i]}_${v}`;
      if (from !== target) roll.set(from, target);
    }
    // …and every copy of every ascended form is accounted on the 术士's shared-pool entry
    for (let i = 1; i <= stage + 1; i++) pool.set(`${FORM_FAMILY[i]}_${v}`, `${AMIYA_CASTER}_${v}`);
  }
  return { quest: questId, roll, pool };
}

/** Fresh quest state (the EffectRef's `data`; transparent to the client through effectsView). */
export function newAmiyaQuestState() {
  return { state: 'choose', quest: null, dmg: 0, heal: 0 };
}

/**
 * Fold one successful `claim` into the state: the line moves to its next step — `active` again, with the counters
 * RESET (each step is scored on its own; the damage that opened step one would otherwise clear step two on sight) —
 * or, on the last step, `done`. `d.quest` keeps the claimed step's id while `done`, so the panel can still name the
 * form it ended as. Returns the new `state`.
 */
export function amiyaAdvance(d) {
  if (!d) return null;
  const next = amiyaNextQuest(d.quest);
  if (next) {
    d.state = 'active';
    d.quest = next;
    d.dmg = 0;
    d.heal = 0;
  } else {
    d.state = 'done';
  }
  return d.state;
}

/** Fold one onBattleResult result into the state (mutates `d`; non-negative only). Returns `d`. */
export function foldAmiyaQuestResult(d, result) {
  if (!d || !result) return d;
  for (const u of Array.isArray(result.unitStats) ? result.unitStats : []) {
    if (u && isAmiyaChessId(u.defId)) d.dmg += Math.max(0, Number(u.dmg) || 0);
  }
  d.heal += Math.max(0, Number(result.healingDone) || 0);
  return d;
}

/** Are `questId`'s conditions met by the progress in `d`? */
export function amiyaQuestDone(d, questId) {
  const q = AMIYA_QUESTS[questId];
  if (!q || !d) return false;
  return d.dmg >= q.dmg && (!q.heal || d.heal >= q.heal);
}

/** Remaining { dmg, heal } of `questId` (0 once met). */
export function amiyaQuestRemaining(d, questId) {
  const q = AMIYA_QUESTS[questId];
  if (!q || !d) return { dmg: 0, heal: 0 };
  return { dmg: Math.max(0, q.dmg - d.dmg), heal: Math.max(0, q.heal - d.heal) };
}
