// mod/rhodes/kits/ops/chess_rhodes_kalts2.js — 罗德岛 mod 凯尔希·思衡托 (chess_rhodes_kalts2_a/_b) 守望者 kit, tier 6.
// Extracted verbatim from the 0.1.3 tier6.js (kalts2, lines 3602–3709) + its module-private consts (3598/3600).
// Conventions of the tier-6 kits: ../../../../server/sim/content/kits/shared/tier6.js; kit contract and rules: README.

import { num, bv, tbb, live, hasBond, selectedSkill, batOf, skillGridOf } from '../shared/tier6.js';
import { COLS } from '../../../constants.js';
import { releaseSkillSummon } from '../../tokens.js';

const KALTS2_ANCHOR = 'token_10068_kalts2_mtship';
/** [ASSUMED] splash radius (tiles) of 保护性拒止 — the official blackboard carries no 溅射半径. */
const KALTS2_SPLASH = 1.0;

function kalts2(bb, chess, def) {
  const t0 = tbb(def, 0), t1 = tbb(def, 1);
  const sel = selectedSkill(chess, def);
  const S1 = sel === 'skchr_kalts2_1';
  const anchor = (def?.tokens || []).find((t) => typeof t === 'string' && /mtship/.test(t)) ?? KALTS2_ANCHOR;
  const blockRadius = num(t0.block_radius_scale, 0.23);
  /** 医者丰碑: the allies that already collected the entry gift (re-armed when they leave her range). */
  const gifted = new Set();
  /** 破梏重生 (S3) — the default skill (a factory: each spec must read the blackboard of ITS own skill). */
  const s3Spec = () => ({
    kind: 'duration',
    // 守望者's profile is dmgType 'heal' (professions.js MEDIC), so skills.js would call this a heal skill and hold it
    // back until an INJURED ally is in range — at full HP it never casts (a.k.a. the 战术锚点 never deploys). `heal:false`
    // + trigger `SEARCH` (an enemy inside the initial range, checked every tick — skills.js TICK_RULES) makes it cast
    // for its output / summon, not for a heal. Same device 瑕光 / the author's own ops use (heal:false).
    heal: false, trigger: 'SEARCH',
    mods: { atkPct: bv(bb, 'atk', 1.25), batPct: batOf(bv(bb, 'base_attack_time', -1.55), def) },
    targeting: { maxTargets: 2 },          // 额外治疗1个目标
    onStart({ battle, unit }) { releaseSkillSummon(battle, unit, anchor); },
  });
  return {
    install(battle, unit) {
      // ---- 天赋1 遗尘守望 ----
      const watch = () => {
        if (!live(unit) || unit.findBuff('kalts2:watch')) return;
        battle.addBuff(unit, {
          key: 'kalts2:watch', persist: true, allowDead: true, visible: true,
          mods: {
            hpPct: num(t0.max_hp, 0.25), defPct: num(t0.def, 0.25),
            blockCnt: num(t0.block_cnt, 1), blockRadiusAdd: blockRadius,
          },
          // 起飞 (gamedata_const ba.liftoff): `liftoff` = no ground enemy blocked / no ground enemy selects her, and
          // `blockFly` = she blocks FLYERS instead (the same pair 蒂比's take-off uses, tier2 LIFTOFF_FLAGS) — without
          // it the +1 block would block nothing at all.
          flags: { liftoff: true, blockFly: true },
        });
      };
      battle.on('deploy', (c) => { if (c.unit === unit) watch(); }, { owner: unit });
      watch();
      // ---- 天赋2 医者丰碑 ----
      const regen = num(t1.hp_recovery_per_sec, 50);
      const dur = num(t1.buff_duration, 30);
      const bonus = num(t1.rhodes_bonus, 2);
      battle.every(0.2, () => {
        if (!live(unit)) return;
        const set = unit.rangeKeySet || new Set(unit.rangeKeys);
        const now = new Set();
        for (const a of battle.allies(unit.ownerId)) {
          const k = a.uid ?? a.id;
          if (a === unit || a.kind !== 'op' || !set.has(a.tileR * COLS + a.tileC)) continue;
          now.add(k);
          if (gifted.has(k)) continue;                       // 不可叠加: the gift lands once per entry
          gifted.add(k);
          if (!a.findBuff(`kalts2:monument:${unit.id}`)) {
            battle.addBuff(a, { key: `kalts2:monument:${unit.id}`, shieldHits: 1, duration: dur, visible: true, source: unit });
          }
          battle.addBuff(a, {
            key: `kalts2:monumentRegen:${unit.id}`, duration: dur, refresh: 'replace', visible: true, source: unit,
            mods: { hpRegen: regen * (hasBond(a, 'rhodesShip') ? bonus : 1) },
          });
          battle.fx('heal', { x: a.x, y: a.y, id: a.id, src: unit.id });
        }
        for (const k of [...gifted]) if (!now.has(k)) gifted.delete(k);   // leaving re-arms the entry
      }, { owner: unit });
      // ---- S1 应急肃正防线: 所有其他起飞的友方干员阻挡范围扩大 ----
      if (S1) {
        const add = bv(bb, 'attack@block_radius_scale', blockRadius);
        battle.every(0.25, () => {
          if (!live(unit) || !(unit.skill && unit.skill.active) || !(add > 0)) return;
          for (const a of battle.allies(unit.ownerId)) {
            if (a === unit || !a.s.flags.liftoff) continue;
            battle.addBuff(a, { key: `kalts2:defense:${unit.id}`, duration: 0.5, refresh: 'replace', mods: { blockRadiusAdd: add }, source: unit });
          }
        }, { owner: unit });
      }
    },
    skill: s3Spec(),                           // S3 破梏重生 is her default skill
    skills: {
      skchr_kalts2_3: s3Spec(),
      // S1 应急肃正防线
      skchr_kalts2_1: {
        kind: 'duration',
        mods: { atkPct: bv(bb, 'atk', 0.75), aspd: bv(bb, 'attack_speed', 35) },
      },
      // S2 保护性拒止 — an AMMO OUTPUT skill (真实伤害 splash + heal around each hit): it must cast on an enemy, not
      // on an injured ally. `heal:false` + `SEARCH` so 守望者's heal-type profile does not gate it behind a wounded
      // ally (see s3Spec's note; the author's 瑕光 uses the same `heal:false` device).
      skchr_kalts2_2: {
        kind: 'ammo',
        heal: false,
        trigger: 'SEARCH',
        ammo: Math.max(1, Math.floor(bv(bb, 'attack@trigger_time', 10))),
        mods: { atkPct: bv(bb, 'atk', 1.25) },
        ...(skillGridOf(def) ? { targeting: { rangeGrid: skillGridOf(def) } } : {}),
        attack: {
          dmgType: 'true',
          atkScale: 0,                          // the 医疗单元's own hit deals no damage — the burst around it is the damage
          projectile: 'bolt',
          onEachHit({ battle, unit, target }) {
            if (!target || target.side !== 'enemy') return;
            const dmg = unit.s.atk * bv(bb, 'attack@atk_scale', 3.5);
            const heal = unit.s.atk * bv(bb, 'attack@heal_scale', 1.7);
            const slow = bv(bb, 'attack@sluggish', 5);
            battle.fx('aoe', { x: target.x, y: target.y, id: unit.id, r: KALTS2_SPLASH, dmgType: 'true' });
            for (const e of battle.enemiesInRadius(target.x, target.y, KALTS2_SPLASH, true)) {
              battle.dealDamage(unit, e, { amount: dmg, type: 'true', isSkill: true, tags: ['skill', 'kalts2:repulse'] });
              if (e.alive && slow > 0) battle.applyStatus(e, 'sluggish', { duration: slow, source: unit });
            }
            for (const a of battle.alliesInRadius(target.x, target.y, KALTS2_SPLASH, unit.ownerId)) {
              battle.heal(unit, a, heal, { tags: ['skill', 'kalts2:repulse'] });
            }
          },
        },
      },
    },
  };
}

export default {
  // 凯尔希·思衡托 — the old registry wired only `_a` (the elite would share the same kit)
  chess_rhodes_kalts2_a: kalts2,
};
