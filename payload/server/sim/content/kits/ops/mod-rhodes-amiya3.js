// mod/rhodes/kits/ops/chess_rhodes_amiya3.js — 罗德岛 mod 阿米娅·医疗 (chess_rhodes_amiya3_a/_b) kit, tier 3.
// Extracted verbatim from the 0.1.3 tier3.js (amiyaMedic, lines 315–380) + its local helpers (302–313).
// Conventions of the tier-3 kits: ../shared/tier3.js; kit contract and rules: ../README.md.

import { num } from '../shared/tier1.js';

/** Aura cadence for the 罗德岛 mod kit in this file (阿米娅·医疗). */
const AURA_IV = 0.25;
const AURA_DUR = 0.5;
const modsOut = (m) => { const o = {}; for (const k of Object.keys(m)) { const v = m[k]; if (typeof v === 'number' && Number.isFinite(v) && v !== 0) o[k] = v; } return o; };
/** Periodic check while the unit is on the field. */
function whileOn(battle, unit, sec, fn) { battle.every(sec, () => { if (unit.alive && unit.deployed && !unit.removed) fn(); }, { owner: unit }); }
/** `skills` map whose entries are built only when read (each spec is a function of the SELECTED skill's bb). */
function lazySkills(builders) {
  const o = {};
  for (const [id, build] of Object.entries(builders)) Object.defineProperty(o, id, { enumerable: true, get: build });
  return o;
}

function amiyaMedic(bb, chess) {
  const t0 = (chess?.talents || []).find((t) => t && t.index === 0)?.bb ?? {}; // 诚挚期许 { max_hp, hp_recovery_… }
  const s1rec = (chess?.skills || []).find((s) => s && s.skillId === 'skchr_amiya3_1');
  const grid1 = Array.isArray(s1rec?.rangeGrid) && s1rec.rangeGrid.length ? s1rec.rangeGrid : null;
  return {
    skills: lazySkills({
      // bb is the SELECTED skill's blackboard (simdata getChess), so this builder only ever sees S1's own numbers.
      skchr_amiya3_1: () => ({
        kind: 'duration',
        mods: modsOut({ aspd: num(bb.attack_speed) }),
        ...(grid1 ? { trigger: { rule: 'SKILL_RANGE', grid: grid1 } } : {}),
        onAttack({ battle, unit }) {
          const heal = unit.s.atk * num(bb.heal_scale, 0.15);
          if (!(heal > 0)) return;
          const area = battle.unitsInGrid(unit, grid1 || [[0, 0]], { side: 'ally' })
            .filter((a) => a.kind !== 'device' && !(a.s.flags.noHeal || a.profile?.noHeal));
          if (!area.length) return;
          for (const a of area) battle.heal(unit, a, heal, { tags: ['skill', 'incantation', 'amiya3:empathy'] });
          battle.fx('healAoe', { x: unit.x, y: unit.y, id: unit.id, r: 2 });
        },
      }),
    }),
    // S2 慈悲愿景 is the chess's default skill (isDefault) → the `skill` spec.
    skill: {
      kind: 'duration',
      targeting: { maxTargets: 2 },
      attack: { dmgType: 'true' },
      onStart({ battle, unit, skill }) {
        const scale = num(bb.atk_scale, 1.55), perStack = num(bb.atk, 0.2);
        const maxStack = Math.max(1, Math.floor(num(bb.max_stack_cnt, 5)));
        const cands = battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile);
        // "先按范围内敌人数量提升攻击力，后造成范围技能伤害" — the ATK% is granted before the strike reads unit.s.atk
        const stacks = Math.min(cands.length, maxStack);
        if (stacks > 0 && perStack) {
          battle.addBuff(unit, { key: 'amiya3:visionAtk', duration: skill.timeLeft, visible: true, source: unit, mods: { atkPct: perStack * stacks } });
        }
        for (const e of cands) {
          battle.dealDamage(unit, e, { amount: unit.s.atk * scale, type: 'arts', isSkill: true, tags: ['skill', 'amiya3:vision'] });
          battle.addBuff(e, {
            key: 'amiya3:bewitch', duration: num(bb['amiya3_s_2[debuff].duration'], 6), refresh: 'replace', source: unit, visible: true,
            mods: modsOut({ aspd: num(bb['amiya3_s_2[debuff].attack_speed'], -60), moveMul: 1 + num(bb['amiya3_s_2[debuff].move_speed'], -0.6) }),
          });
        }
        if (cands.length) battle.fx('aoe', { x: unit.x, y: unit.y, id: unit.id, r: 2, skill: 'amiya3Vision' });
      },
      // "整场战斗中该技能只能释放一次": the engine has no once-per-battle flag, so the runtime is switched off at the end
      onEnd({ unit }) { unit.skill.noSkill = true; },
    },
    talents: [{
      install(battle, unit) {
        const hp = num(t0.max_hp, 0.08), regen = num(t0.hp_recovery_per_sec_by_max_hp_ratio, 0.025);
        if (hp > 0) {
          whileOn(battle, unit, AURA_IV, () => {
            for (const a of battle.allies()) battle.addBuff(a, { key: 'amiya3:oath', duration: AURA_DUR, mods: { hpPct: hp } });
          });
        }
        if (regen > 0) {
          whileOn(battle, unit, AURA_IV, () => {
            if (!unit.skill?.active) return;
            for (const a of battle.allies()) battle.addBuff(a, { key: 'amiya3:oathRegen', duration: AURA_DUR, source: unit, mods: { hpRegenRatio: regen } });
          });
        }
      },
    }],
  };
}

export default {
  // ---- 罗德岛 mod — 阿米娅·医疗 (chess_rhodes_amiya3_a/_b, 3本 since the 2026-10-06 re-tier)
  // One key: the elite `_b` record's `baseId` is `_a`, so kitOf resolves it here (kits/README.md).
  chess_rhodes_amiya3_a: amiyaMedic,
};
