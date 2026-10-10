// mod/rhodes/kits/ops/mod-rhodes-amiya.js — 罗德岛 mod 阿米娅·术师形态 (chess_rhodes_amiya_a/_b) kit, tier 2.
// The shop form of the 升变 operator (docs/MOD-RHODES.md §升变): the player buys THIS form, the quest panel then
// transforms her into the 近卫 (mod-rhodes-amiya2.js) or 医疗 (mod-rhodes-amiya3.js) form.
//
// Official projection (char_002_amiya, 中坚术师, 5★):
//   S1 战术咏唱·γ型 (skcom_magic_rage[3])  — duration aspd buff. The generic 施法 helper covers it, but the kit
//                                            ships every unlocked skill explicitly (the kit contract replaces the
//                                            generic resolution for this chess).
//   S2 精神爆发   (skchr_amiya_2)          — the 2本 NORMAL record's default (highest unlocked index at phase 1):
//                                            each attack becomes `attack@times` hits at `attack@atk_scale`, then
//                                            阿米娅 is stunned `stun` s. AUTO.
//   S3 奇美拉     (skchr_amiya_3)          — the 精锐's default (phase 2): atk/maxHP up, range widens to the skill's
//                                            own 3-4 grid, damage type becomes TRUE, and she is forced off the
//                                            field when it ends.
//   天赋 情绪吸收 (elite only)             — +SP per damage instance dealt, more per kill.
//
// Simplifications (documented, the same convention as every kit here):
//   · 精神爆发 "随机攻击范围内的目标" hits the CURRENT main target `times` times (the engine's attack.hits rule)
//     instead of scattering the hits randomly — the total is identical, the spread is not.
//   · 奇美拉's "强制退出战场" is a plain retreat (she may be redeployed later), not the AK once-per-deployment lock.

import { num, talentBb, skillRec, onHitBy, giveSp } from '../shared/tier1.js';

const modsOut = (m) => { const o = {}; for (const k of Object.keys(m)) { const v = m[k]; if (typeof v === 'number' && Number.isFinite(v) && v !== 0) o[k] = v; } return o; };
/** `skills` map whose entries are built only when read (each spec is a function of the SELECTED skill's bb). */
function lazySkills(builders) {
  const o = {};
  for (const [id, build] of Object.entries(builders)) Object.defineProperty(o, id, { enumerable: true, get: build });
  return o;
}
/** The grid of skill `skillId` on the raw chess record (the builder resolved it from skill_table / skillRangeDict). */
const gridOf = (chess, skillId) => skillRec(chess, skillId)?.rangeGrid ?? null;

function amiyaCaster(bb, chess) {
  const t0 = talentBb(chess, 0); // 情绪吸收 (elite records only; the normal's slot is the ??? placeholder — empty bb)
  const grid3 = gridOf(chess, 'skchr_amiya_3');
  // Per-id specs, each a builder of the SELECTED skill's bb (only the selected id is ever read: selectSkillSpec
  // looks up `skills[selected]`, or takes the top-level `skill` when the selected skill IS the record's default).
  const spec = {
    // S1 战术咏唱·γ型 — bb is the SELECTED skill's blackboard, so the plain aspd buff reads it directly.
    'skcom_magic_rage[3]': () => ({
      kind: 'duration',
      mods: modsOut({ aspd: num(bb.attack_speed) }),
    }),
    // S2 精神爆发 — `attack@`-prefixed keys (the official sub-bb namespace); the post-skill stun is the self-debuff
    // the description states (and the reason the AUTO skill is a gamble).
    skchr_amiya_2: () => ({
      kind: 'duration',
      attack: { hits: Math.max(1, Math.round(num(bb['attack@times'], 1))), atkScale: num(bb['attack@atk_scale'], 1) },
      onEnd({ battle, unit }) {
        const stun = num(bb.stun, 0);
        if (!(stun > 0)) return;
        battle.addBuff(unit, { key: 'amiya:burstStun', duration: stun, flags: { stun: true }, visible: true, source: unit });
      },
    }),
    // S3 奇美拉 — true-damage attacks on the skill's own wider grid (targeting: the live range IS the skill's grid
    // while it runs); the forced retreat at the end IS the cost.
    skchr_amiya_3: () => ({
      kind: 'duration',
      mods: modsOut({ atkPct: num(bb.atk), hpPct: num(bb.max_hp) }),
      attack: { dmgType: 'true' },
      targeting: grid3 ? { rangeGrid: grid3 } : undefined,
      ...(grid3 ? { trigger: { rule: 'SKILL_RANGE', grid: grid3 } } : {}),
      onEnd({ battle, unit }) { battle.retreat(unit, { reason: 'amiya:chimera' }); },
    }),
  };
  // The record's default skill rides the top-level `skill` (the kit contract — selectSkillSpec consults the
  // `skills` map only for NON-default picks): S2 精神爆发 on the 2本 normal, S3 奇美拉 on the 精锐.
  const defaultId = (chess?.skills ?? []).find((s) => s && s.isDefault)?.skillId ?? null;
  const selected = chess?.skill?.skillId ?? defaultId;
  const map = { ...spec };
  if (defaultId) delete map[defaultId];
  return {
    skills: lazySkills(map),
    skill: selected === defaultId && spec[selected] ? spec[selected]() : null,
    talents: [{
      install(battle, unit) {
        // 情绪吸收 — "成功造成伤害后额外回复{sp}点技力，消灭敌人后额外获得{killSp}点技力". An empty bb (the normal's
        // ??? placeholder) installs nothing.
        const perHit = num(t0['amiya_t_1[atk].sp'], 0);
        const perKill = num(t0['amiya_t_1[kill].sp'], 0);
        if (perHit > 0) onHitBy(battle, unit, () => { giveSp(unit, perHit, 'amiyaTalent'); });
        if (perKill > 0) {
          battle.on('kill', (c) => { if (c.killer === unit) giveSp(unit, perKill, 'amiyaTalent'); }, { owner: unit });
        }
      },
    }],
  };
}

export default {
  // ---- 罗德岛 mod — 阿米娅·术师形态 (chess_rhodes_amiya_a/_b, 2本, the shop form of the 升变 operator)
  chess_rhodes_amiya_a: amiyaCaster,
};
