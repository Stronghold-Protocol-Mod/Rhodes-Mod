// mod/rhodes/kits/ops/chess_rhodes_ascln.js — 罗德岛 mod 阿斯卡纶 (chess_rhodes_ascln_a/_b) ambusher kit, tier 4.
// Extracted verbatim from the 0.1.3 tier4.js (chess_rhodes_ascln_a, lines 2096–2198).
// Conventions of the tier-4 kits: ../shared/tier4.js; kit contract and rules: ../README.md.

import { num, tbb, moduleBb, grid, batFlat, keySet, enemiesOnRange, whileDeployed, pulse, toggleBuff, skillActive, isSel, alt, instantKind, AURA } from '../shared/tier4.js';
import { bodyInKeys } from '../../../body.js';

/** Id of the selected skill. */
const selId = (def) => def?.skill?.id ?? def?.raw?.skill?.skillId ?? null;
/** The 4 tiles orthogonally around a unit (高台 checks such as 阿斯卡纶's 噬光残影). */
const ORTHO4 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

export default {
  // ===== 阿斯卡纶 (ambusher; the 罗德岛 mod's chess_rhodes_ascln_a/_b, projected by build-rhodes-mod.mjs — it lives in
  //       tier 4 because the mod keeps one id per cost tier). 特性 (professions.js `stalker`): damages EVERY enemy in
  //       range, 50 % phys/arts dodge, taunt −1.
  //       T0 死亡拘审 — an attack stacks a debuff on the victim: MSPD −move_speed and atk_ratio × Ascalon's CURRENT ATK
  //         arts per second (法术持续伤害: it scales with her live ATK, so 恩赐/模组 raise it too), debuff_duration s, up
  //         to max_stack_cnt layers; a re-hit adds a layer and restarts the timer. The layers combine ADDITIVELY
  //         (18/36/54 % MSPD, 10/20/30 % ATK — the official wiki's "stack additively"; the PRTS 备注 "叠加时令已有的
  //         减速效果数值增加一倍" is that additive reading, not a doubling). All layers end the moment she leaves the field.
  //         (Her 罗德岛 layer-on-kill ruling is her 特质 now, not a talent — data/garrisons.json garrison_rhodes_ascln_*.)
  //       T1 噬光残影 — ASPD +attack_speed, +attack_speed_add while any of the 4 adjacent tiles is HIGH ground.
  //       Module AMB-X “无形，无情” (the hidden data talent `move_speed` −0.2): aura, every enemy in range −20 % MSPD.
  //       S1 追袭 (AUTO, charges): the next attack is atk_scale × ATK and lands twice on every enemy in range.
  //       S2 恩赐: ATK +atk, every enemy in range slowed by move_speed (live aura ⇒ it combines with the talent's stacks),
  //         and a GROUND enemy killed INSIDE her range blasts one 死亡拘审 layer onto the ground enemies within
  //         range_radius (PRTS 备注: 尸爆半径 1.3, splash = 周围地面敌人).
  //       S3 降临: range y-10, ATK +atk, BAT base_attack_time (flat), taunt +taunt_level (−1 → +1: she draws ranged
  //         fire), and ground enemies in her range lose damage_hitrate_* accuracy — their phys/arts ATTACK instances that
  //         roll below it are cancelled (an engine `hit`-hook cancel, the same shape as a dodge; a 未命中 is not a 闪避,
  //         so no `dodge` event fires). Every such miss against HER (or her own 50 % dodge) heals hp_ratio × max HP.
  chess_rhodes_ascln_a: (bb, chess, def) => {
    const t0 = tbb(def, 0), t1 = tbb(def, 1), mb = moduleBb(def);
    const S2 = isSel(def, 'skchr_ascln_2'), S3 = isSel(def, 'skchr_ascln_3');
    const slow = num(t0.move_speed, -0.18), ratio = num(t0.atk_ratio, 0.1);
    const maxStack = Math.max(1, Math.floor(num(t0.max_stack_cnt, 3)));
    const doomDur = num(t0.debuff_duration, 25), doomIv = Math.max(0.1, num(t0.interval, 1));
    const DOOM = 'ascln:doom';
    const s3Grid = grid((chess.skills || []).find((s) => s.skillId === selId(def))?.rangeGrid ?? def.skill?.rangeGrid);
    /** Any of the 4 tiles orthogonally around `unit` is HIGH ground (噬光残影). */
    const highGround = (battle, unit) => {
      for (const [dr, dc] of ORTHO4) {
        const r = unit.tileR + dr, c = unit.tileC + dc;
        if (!battle.grid.inBounds(r, c)) continue; // NOTE: not inRect — 高台 usually sits one row OUTSIDE the sim rect
        const t = battle.grid.tile(r, c);
        if (t.height === 'HIGH' && t.key !== 'tile_forbidden') return true;
      }
      return false;
    };
    return {
      skills: alt(def, {
        skchr_ascln_1: () => ({
          kind: instantKind(def),
          attack: { atkScale: num(bb.atk_scale, 1.7), hits: 2 },
          onStart({ battle, unit }) { battle.fx('charge', { x: unit.x, y: unit.y, id: unit.id }); },
        }),
        skchr_ascln_2: () => ({
          kind: 'duration',
          mods: { atkPct: num(bb.atk, 0.9) },
          onStart({ battle, unit }) { battle.fx('buff', { x: unit.x, y: unit.y, id: unit.id }); },
        }),
      }),
      skill: { // S3 降临 (her default skill)
        kind: 'duration',
        mods: { atkPct: num(bb.atk, 0.2), batPct: batFlat(def, bb.base_attack_time), taunt: num(bb.taunt_level, 2) },
        targeting: s3Grid ? { rangeGrid: s3Grid } : undefined,
        onStart({ battle, unit }) { battle.fx('ward', { x: unit.x, y: unit.y, id: unit.id }); },
      },
      install(battle, unit) {
        // ---- 第一天赋 死亡拘审 ----
        const doom = (e) => {
          if (!e || !e.alive || e.side !== 'enemy') return;
          const n = Math.min(maxStack, (e.findBuff(DOOM)?.stacks ?? 0) + 1);
          battle.addBuff(e, {
            key: DOOM, duration: doomDur, source: unit, stacks: n, maxStacks: maxStack, visible: true,
            mods: { moveMul: Math.max(0, 1 + slow * n) },
            interval: doomIv,
            // 当前攻击力 at tick time: her live ATK (恩赐 / 模组 / 盟约 included), ×atk_ratio per layer
            onTick: ({ unit: t }) => {
              if (!t.alive || t.hidden || !t.deployed || !unit.alive || !unit.deployed) return;
              battle.dealDamage(unit, t, { amount: unit.s.atk * ratio * n, type: 'arts', tags: ['talent', 'dot'] });
            },
          });
        };
        battle.on('damaged', (c) => {
          if (c.source !== unit || !c.dmg?.isAttack || c.target.side !== 'enemy') return;
          doom(c.target);
        }, { owner: unit });
        battle.on('death', (c) => { // 自身退场后，所有已施加的本天赋效果将立刻结束
          if (c.unit !== unit) return;
          for (const e of battle.enemies) if (e.findBuff(DOOM)) battle.removeBuff(e, DOOM);
        }, { owner: unit });
        // ---- 第二天赋 噬光残影 ----
        whileDeployed(battle, unit, AURA, () => {
          const v = num(t1.attack_speed, 8) + (highGround(battle, unit) ? num(t1.attack_speed_add, 6) : 0);
          toggleBuff(battle, unit, 'ascln:penumbra', true, { aspd: v });
        });
        // ---- module AMB-X: 攻击范围内所有敌人移动速度-20% ----
        const ms = num(mb.move_speed, 0);
        if (ms) whileDeployed(battle, unit, AURA, () => { for (const e of enemiesOnRange(battle, unit)) pulse(battle, e, `ascln:hidden:${unit.id}`, { moveMul: Math.max(0, 1 + ms) }); });
        // ---- S2 恩赐 ----
        if (S2) {
          const s2Slow = num(bb.move_speed, -0.4), rad = num(bb.range_radius, 1.3);
          whileDeployed(battle, unit, AURA, () => {
            if (!skillActive(unit)) return;
            for (const e of enemiesOnRange(battle, unit)) pulse(battle, e, `ascln:bounty:${unit.id}`, { moveMul: Math.max(0, 1 + s2Slow) });
          });
          battle.on('kill', (c) => {
            const v = c.victim;
            if (!skillActive(unit) || !v || v.side !== 'enemy' || v.isFlying) return; // 地面敌人被击倒时
            if (!bodyInKeys(v, keySet(unit))) return;                                 // …在攻击范围内
            battle.fx('aoe', { x: v.x, y: v.y, radius: rad, id: unit.id });
            for (const e of battle.enemiesInRadius(v.x, v.y, rad)) if (e !== v && !e.isFlying) doom(e); // 周围地面敌人
          }, { owner: unit });
        }
        // ---- S3 降临 ----
        if (S3) {
          const miss = Math.abs(num(bb['attack@damage_hitrate_physical'], -0.3));
          const healRatio = num(bb['attack@hp_ratio'], 0.05);
          const mend = () => { if (unit.alive) battle.heal(unit, unit, unit.s.maxHp * healRatio, { self: true, tags: ['talent'] }); };
          battle.on('hit', (c) => { // 攻击范围内的地面敌人物理与法术命中率-30%
            const d = c.dmg, src = c.source;
            if (!d || d.cancel || !d.isAttack || !src || src.side !== 'enemy' || src.isFlying) return;
            if ((d.type !== 'phys' && d.type !== 'arts') || !skillActive(unit) || !(miss > 0)) return;
            if (!bodyInKeys(src, keySet(unit)) || !battle.rng.chance(miss)) return;
            d.cancel = true; // 未命中 (not a 闪避: no `dodge` event)
            battle.fx('miss', { x: c.target.x, y: c.target.y, id: c.target.id });
            if (c.target === unit) mend();
          }, { owner: unit, priority: 20 });
          battle.on('dodge', (c) => { if (c.target === unit && skillActive(unit)) mend(); }, { owner: unit }); // 自身闪避时
        }
      },
    };
  },
};
