// mod/rhodes/kits/ops/mod-rhodes-amiya2.js — 罗德岛 mod 阿米娅·近卫形态 (chess_rhodes_amiya2_a/_b) kit, tier 5.
// A 升变 TARGET (docs/MOD-RHODES.md §升变): never bought — reached by completing the 〈继承之剑〉 quest path and
// claiming it. Official identity: 术战者, the form 阿米娅 takes in chapter 8 after fusing 陈 / 塔露拉 / 奎隆's
// emotions; her sword is 青色怒火, 魔王奎隆's blade inscribed 「争斗在此止歇」.
//
// Official projection (char_1001_amiya2, 5★):
//   天赋 青色怒火      — while she is on the field every ally gains atk/def (+7%), DOUBLED while a skill of hers runs
//                        (both skills carry `talent_scale: 2`).
//   S1 影霄·奔夜       — duration: atk up, attacks become two hits, 60% arts dodge while it runs.
//   S2 影霄·绝影       — an instant 10-slash burst on the lowest-HP enemy of the skill's own forward grid (x-2),
//                        the last slash at double scale as TRUE damage; every enemy slain by the burst grants
//                        atk/res (max 3), and her attacks stay true damage for the rest of the skill. Once per battle.
//
// Simplifications (documented):
//   · The burst re-targets the lowest-HP enemy of the grid per slash when its target dies (the official text pins one
//     target; a dead one would waste the remaining slashes).
//   · The kill stacks ride the skill's remaining duration (the official "接下来的伤害类型变为真实" window) rather than
//     a separate timer.

import { num, talentBb, skillRec, skillBbOf, onHitOn, enemiesInGrid, installAura } from '../shared/tier1.js';

const modsOut = (m) => { const o = {}; for (const k of Object.keys(m)) { const v = m[k]; if (typeof v === 'number' && Number.isFinite(v) && v !== 0) o[k] = v; } return o; };
function lazySkills(builders) {
  const o = {};
  for (const [id, build] of Object.entries(builders)) Object.defineProperty(o, id, { enumerable: true, get: build });
  return o;
}
const gridOf = (chess, skillId) => skillRec(chess, skillId)?.rangeGrid ?? null;

function amiyaGuard(bb, chess) {
  const t0 = talentBb(chess, 0); // 青色怒火 { atk, def }
  const s1bb = skillBbOf(chess, 'skchr_amiya2_1'); // 影霄·奔夜's own blackboard (the dodge chance lives there)
  const grid2 = gridOf(chess, 'skchr_amiya2_2');
  // Per-id specs, each a builder of the SELECTED skill's bb (only the selected id is ever read).
  const spec = {
    // S1 影霄·奔夜 — two hits per attack at full scale (the official is a plain 二连击); the arts dodge is armed by
    // onStart and disarmed by onEnd (the talent's hit hook reads the flag), so it lives exactly while the skill does.
    skchr_amiya2_1: () => ({
      kind: 'duration',
      mods: modsOut({ atkPct: num(bb.atk) }),
      attack: { hits: 2 },
      onStart({ unit }) { unit.mem.amiya2Dodge = true; },
      onEnd({ unit }) { unit.mem.amiya2Dodge = false; },
    }),
    // S2 影霄·绝影 — the burst runs in onStart (explicit amounts, so the skill's true-damage attack override does
    // not touch the nine arts slashes); the true override covers her OWN attacks for the rest of the duration, which
    // is exactly the official "接下来的伤害类型变为真实". targeting: while it runs her live range IS the skill's
    // own forward grid (21 tiles on the projected record).
    skchr_amiya2_2: () => ({
      kind: 'duration',
      attack: { dmgType: 'true' },
      targeting: grid2 ? { rangeGrid: grid2 } : undefined,
      ...(grid2 ? { trigger: { rule: 'SKILL_RANGE', grid: grid2 } } : {}),
        onStart({ battle, unit, skill }) {
          const times = Math.max(1, Math.round(num(bb.times, 1)));
          const scale = num(bb.atk_scale, 1);
          const lastScale = num(bb.atk_scale_2, scale * 2);
          const perKillAtk = num(bb['amiya2_s_2[kill].atk'], 0);
          const perKillRes = num(bb['amiya2_s_2[kill].magic_resistance'], 0);
          const maxStack = Math.max(1, Math.floor(num(bb['amiya2_s_2[kill].max_stack_cnt'], 3)));
          let stacks = 0;
          const grantStack = () => {
            if (stacks >= maxStack) return;
            stacks += 1;
            battle.addBuff(unit, {
              key: 'amiya2:execute', duration: Math.max(0.1, skill.timeLeft), refresh: 'replace', visible: true, source: unit,
              mods: modsOut({ atkPct: perKillAtk * stacks, resFlat: perKillRes * stacks }),
            });
          };
          for (let i = 0; i < times; i++) {
            const cands = enemiesInGrid(battle, unit, grid2 || null, { priority: 'lowestHp' });
            const t = cands[0];
            if (!t || !t.alive) break;
            const last = i === times - 1;
            const wasAlive = t.alive;
            battle.dealDamage(unit, t, {
              amount: unit.s.atk * (last ? lastScale : scale),
              type: last ? 'true' : 'arts', isSkill: true, tags: ['skill', 'amiya2:slash'],
            });
            if (wasAlive && !t.alive) grantStack();
            battle.fx('aoe', { x: t.x, y: t.y, id: unit.id, r: 0.6, skill: 'amiya2Slash' });
          }
        },
        // "整场战斗中该技能只能释放一次" — the engine has no once-per-battle flag (the amiya3 pattern).
        onEnd({ unit }) { unit.skill.noSkill = true; },
      }),
  };
  // The record's default skill rides the top-level `skill` (the kit contract — selectSkillSpec consults the
  // `skills` map only for NON-default picks): on BOTH forms the default is S2 影霄·绝影 (isDefault in data).
  const defaultId = (chess?.skills ?? []).find((s) => s && s.isDefault)?.skillId ?? null;
  const selected = chess?.skill?.skillId ?? defaultId;
  const map = { ...spec };
  if (defaultId) delete map[defaultId];
  return {
    skills: lazySkills(map),
    skill: selected === defaultId && spec[selected] ? spec[selected]() : null,
    talents: [{
      install(battle, unit) {
        // 青色怒火 — an aura whose value DOUBLES while one of her skills runs (both skills carry `talent_scale`).
        // installAura re-reads `mods` every pulse, so the doubling follows the skill's live state.
        const atk = num(t0.atk, 0), def = num(t0.def, 0);
        if (atk > 0 || def > 0) {
          installAura(battle, unit, {
            key: 'amiya2:rage',
            select: () => true,
            mods: () => {
              const ts = unit.skill && unit.skill.active && unit.skill.bb ? Math.max(1, num(unit.skill.bb.talent_scale, 1)) : 1;
              return { atkPct: atk * ts, defPct: def * ts };
            },
          });
        }
        // S1's 60% arts dodge, gated on the flag its onStart/onEnd arm (a plain hit-cancel, the engine's dodge shape —
        // the same one tippi's S2 uses).
        const dodge = num(s1bb.prob, 0);
        if (dodge > 0) {
          onHitOn(battle, unit, (c) => {
            if (!unit.mem.amiya2Dodge || !c.dmg || c.dmg.type !== 'arts' || c.dmg.cancel) return;
            if (!battle.rng.chance(dodge)) return;
            c.dmg.cancel = true;
            battle.fx('dodge', { x: unit.x, y: unit.y, id: unit.id });
          });
        }
      },
    }],
  };
}

export default {
  // ---- 罗德岛 mod — 阿米娅·近卫形态 (chess_rhodes_amiya2_a/_b, 5本, the 〈继承之剑〉 transform target)
  chess_rhodes_amiya2_a: amiyaGuard,
};
