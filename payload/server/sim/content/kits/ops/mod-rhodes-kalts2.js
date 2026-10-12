// mod/rhodes/kits/ops/chess_rhodes_kalts2.js — 罗德岛 mod 凯尔希·思衡托 (chess_rhodes_kalts2_a/_b) 守望者 kit, tier 6.
// Extracted verbatim from the 0.1.3 tier6.js (kalts2, lines 3602–3709) + its module-private consts (3598/3600).
// Conventions of the tier-6 kits: ../../../../server/sim/content/kits/shared/tier6.js; kit contract and rules: README.

import { num, bv, tbb, live, hasBond, selectedSkill, batOf, skillGridOf } from '../shared/tier6.js';
import { COLS } from '../../../constants.js';
import { releaseSkillSummon } from '../../tokens.js';

const KALTS2_ANCHOR = 'token_10068_kalts2_mtship';
/**
 * 保护性拒止's damage / heal radius (tiles) around the unit the 医疗单元 strikes: **1.5**. The skill's own blackboard
 * carries no 溅射半径, so this came in as an upstream assumption (1.0) when the kit was extracted; the authoritative value
 * is PRTS 凯尔希·思衡托 S2 备注 「伤害与治疗溅射半径均为1.5」 — the client's projectile_chr_kalts2_s2_dmg / _heal prefabs
 * carry those sub-ranges. The author's 自选 kit of the same character reads it the same way (kits/ops/op-kalts2.js
 * `S2_RADIUS = 1.5`, and its own S2 test asserts a patient 1.41 away is healed). User report 2026-10-11
 * 「凯尔希二技能…效果和文案不符」: at 1.0 the circle held only the impact tile and its orthogonal neighbours, so an ally
 * (or an enemy) one tile away on the DIAGONAL — 1.414 — stayed outside 「目标周围所有…」 no matter that the text says
 * 周围所有: it neither took the true damage nor got the heal.
 */
const KALTS2_SPLASH = 1.5;

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
          // 文案「攻击变为射出**医疗单元**」: the piece's own impact deals no damage at all — the burst around it is the
          // damage. `hitsFn: () => 0` (no hit instance), NOT `atkScale: 0`: the latter still lands a 0-点 damage event on
          // the struck unit, i.e. a real 「受到伤害」 for every `damaged` listener and per-hit counter. Same device as the
          // author's kit (kits/ops/op-kalts2.js `hitsFn: () => 0`).
          hitsFn: () => 0,
          projectile: 'bolt',
          /**
           * 文案「攻击变为射出医疗单元（**优先选择敌人**）」: while the skill runs, an enemy she can select inside her
           * (skill) range keeps priority, but with none left she fires the 医疗单元 at the lowest-HP-ratio INJURED ally
           * in that range instead and the burst follows her across — otherwise the remaining 弹药 of a 10-shot skill
           * would simply rot once the wave is dead, which is exactly the clause that used to have no route here (the
           * MOD's S2 keeps `heal:false` + trigger `SEARCH`, so the skill itself only ever STARTS on an enemy).
           * `true` = the engine attacks as usual; `false` = it must not, because `Battle.forceAttack` has already spent
           * this shot on an ally — the author's own device for the same skill (kits/ops/op-kalts2.js `s2CanAttack`).
           * The enemy probe carries HER OWN `canHitFly` (her profile is a heal one, so no flyer rule of its own): a probe
           * that cannot reach flyers must not report one as available, or the shot would be held back for nothing.
           */
          canAttack(battle, unit) {
            const prof = { canHitFly: !!unit.profile?.canHitFly };
            if (battle.enemiesInKeys(unit.rangeKeys, unit, prof).length || battle.blockedTargets(unit, prof).length) return true;
            const ally = battle.injuredAlliesInKeys(unit.rangeKeys, unit)[0];
            if (ally && battle.forceAttack(unit, [ally])) unit.atkCd = Math.max(unit.atkCd, unit.s.interval);
            return false;
          },
          onEachHit({ battle, unit, target, kind, attackId }) {
            if (kind !== 'main' || !target) return;
            const dmg = unit.s.atk * bv(bb, 'attack@atk_scale', 3.5);
            const heal = unit.s.atk * bv(bb, 'attack@heal_scale', 1.7);
            const slow = bv(bb, 'attack@sluggish', 5);
            const onEnemy = target.side === 'enemy';
            battle.fx('aoe', { x: target.x, y: target.y, id: unit.id, r: KALTS2_SPLASH, dmgType: 'true' });
            battle.fx('healAoe', { x: target.x, y: target.y, id: unit.id, r: KALTS2_SPLASH });
            // 「对目标周围所有敌人造成相当于攻击力N%的真实伤害并使其停顿5秒」 — 真实**普通**伤害 (PRTS S2 备注), so
            // `isAttack` as well as `isSkill`; the AOE selector keeps 不可选中 / 隐匿 enemies out (`foesInRadius`), and
            // 停顿 rides on the enemies the hit reaches, only when the 医疗单元 landed on one.
            const hurt = () => {
              for (const e of battle.foesInRadius(target.x, target.y, KALTS2_SPLASH, true)) {
                battle.dealDamage(unit, e, { amount: dmg, type: 'true', isAttack: true, isSkill: true, attackId, tags: ['skill', 'kalts2:repulse'] });
                if (onEnemy && slow > 0 && e.alive) battle.applyStatus(e, 'sluggish', { duration: slow, source: unit });
              }
            };
            // 「回复目标周围所有友方干员相当于攻击力N%的生命」 — a friendly selector, so a 孤立 ally stays out
            // (`allySelectable`, Battle.allySelectable) exactly like the author's kit's `mend()`.
            const mend = () => {
              for (const a of battle.alliesInRadius(target.x, target.y, KALTS2_SPLASH, unit.ownerId)) {
                if (battle.allySelectable(a, unit)) battle.heal(unit, a, heal, { tags: ['skill', 'kalts2:repulse'] });
              }
            };
            // landing on an enemy: damage first, then the heal; on an ally (no enemy selectable): heal first, no 停顿
            // — the author's own order (kits/ops/op-kalts2.js s2Burst).
            if (onEnemy) { hurt(); mend(); } else { mend(); hurt(); }
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
