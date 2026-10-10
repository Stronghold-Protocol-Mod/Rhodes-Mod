// shared/amiyaQuest.js — 阿米娅升变任务（罗德岛 MOD）的共享定义与纯函数。
//
// 两端共用：服务端的内容注册（server/sim/content/bonds/rhodes.js 的 meta handler）负责「局内首次获得术士阿米娅
// → 建立任务、战斗结算累计进度」，g.amiya 意图（server/match/match/amiya.js）负责「二选一 / 点升变」；客户端的
// 升变面板（public/js/ui/amiyaAscend.js，罗德岛 mod 的 client 自挂载）从 m.private 的 effects[].data 读同一份
// 状态渲染。数字是 mod 自己的设计定案（2026-10-09 用户决策），不是官方数据：
//   〈继承之剑〉(blade)：阿米娅本人累计造成 8000 点伤害 → 术士 → 近卫形态（char_1001_amiya2，奎隆之剑「争斗在此止歇」）
//   〈以伤害的方式拯救〉(lamp)：阿米娅本人累计 6000 点伤害 且 全队累计治疗 8000 点 → 术士 → 医疗形态
//                               （char_1037_amiya3，「以战斗的方式治愈，以伤害的方式拯救」）
// 进度来自 onBattleResult 的 result.unitStats（逐单位 defId/dmg）与 result.healingDone，所以升变 / 合并后的阿米娅
// 继续计数（任何 chess_rhodes_amiya 系的 defId 都算「阿米娅本人」）。
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

/** The two quests: form ids are the FULL record ids (this dataset's `baseId` IS the `_a` id — gamedata baseIdOf
 * returns the normal variant, never the suffix-less family). The elite correspondence is explicit. */
export const AMIYA_QUESTS = Object.freeze({
  blade: Object.freeze({ id: 'blade', name: '继承之剑', form: 'chess_rhodes_amiya2_a', formGolden: 'chess_rhodes_amiya2_b', formName: '近卫形态', dmg: 8000, heal: 0 }),
  lamp: Object.freeze({ id: 'lamp', name: '以伤害的方式拯救', form: 'chess_rhodes_amiya3_a', formGolden: 'chess_rhodes_amiya3_b', formName: '医疗形态', dmg: 6000, heal: 8000 }),
});

export const AMIYA_QUEST_FORMS = Object.freeze([AMIYA_CASTER, AMIYA_GUARD, AMIYA_MEDIC]);

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
 * decision): after the claim this player's shop offers the ascended form wherever it would have offered the 术士 —
 * the same shared-pool copies wearing the new body, so nobody else's shop changes and the form stays unbuyable for
 * anyone who has not finished the quest. `roll` rewrites what a roll drew (caster base → form base, economy.js
 * _rollChessSlot and acquire.js pushRewardOffer); `pool` routes the form's copy accounting (take / give / has /
 * left — diy.js poolOf) back to the caster's shared-pool entry, so buy / merge / sell / elimination never touches
 * a hidden record. Both directions cover normal and elite defensively (only `_a` ids are ever rolled or keyed:
 * `_b` records are isGolden and live outside the pool).
 * @returns {{ quest: string, roll: Map<string, string>, pool: Map<string, string> } | null}
 */
export function amiyaShopSwap(questId) {
  const q = AMIYA_QUESTS[questId];
  if (!q) return null;
  return {
    quest: questId,
    roll: new Map([
      [`${AMIYA_CASTER}_a`, q.form],
      [`${AMIYA_CASTER}_b`, q.formGolden],
    ]),
    pool: new Map([
      [q.form, `${AMIYA_CASTER}_a`],
      [q.formGolden, `${AMIYA_CASTER}_b`],
    ]),
  };
}

/** Fresh quest state (the EffectRef's `data`; transparent to the client through effectsView). */
export function newAmiyaQuestState() {
  return { state: 'choose', quest: null, dmg: 0, heal: 0 };
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
