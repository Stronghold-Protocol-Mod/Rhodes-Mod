// mod/rhodes/kits/ops/chess_rhodes_logos.js — 罗德岛 mod 逻各斯 (chess_rhodes_logos_a/_b) kit, tier 6.
// Extracted verbatim from the 0.1.3 tier6.js (logos, lines 3394–3564) + its module-private consts/helpers (3372–3392).
// Conventions of the tier-6 kits: ../../../../server/sim/content/kits/shared/tier6.js; kit contract and rules: README.

import { num, tbb, live, ANY, elementDmg } from '../shared/tier6.js';
import { sortEnemyTargets, canTargetEnemy } from '../../../targeting.js';
import { bodyInKeys } from '../../../body.js';
import { hasHp } from '../../../damage.js';

const LOGOS_SOUL = 'logos:soul'; // 剜魂具辞 debuff (RES −10, victim takes +150 flat arts damage)
const LOGOS_BURST = 'apoptosisBurst'; // the engine's 凋亡 burst lock (buffs.js), i.e. "处于凋亡损伤爆发期间"

/** The equipped module's data-only talent blackboard (`hidden && fromModule`), or {} when no module is equipped. */
const moduleTalentBb = (chess) => (chess?.talents ?? []).find((t) => t && t.hidden && t.fromModule)?.bb ?? {};

/** The skill's own blackboard from the chess record (each selectable skill carries its level's values). */
function logosBbOf(chess, id) {
  const s = ((chess && chess.skills) || []).find((x) => x && x.skillId === id);
  return s && s.bb && Object.keys(s.bb).length ? s.bb : {};
}

function logosGridOf(chess, id) {
  const r = ((chess && chess.skills) || []).find((x) => x && x.skillId === id)?.rangeGrid;
  return Array.isArray(r) && r.length ? r : null;
}

/** Does this damage instance read as "逻各斯发起的攻击"? (normal attacks, the S2 lock, the S1 exec echo) */
function logosIsAttack(dmg) {
  return !!dmg && (dmg.isAttack || (dmg.tags && (dmg.tags.includes('logos:lock') || dmg.tags.includes('logos:execEcho'))));
}

function logos(bb, chess, def) {
  const t0 = tbb(def, 0); // 语汇演化 { prob, atk_scale, sluggish }
  const t1 = tbb(def, 1); // 剜魂具辞 { duration, magic_resistance, atk_addition }
  const b1 = logosBbOf(chess, 'skchr_logos_1');
  const b2 = logosBbOf(chess, 'skchr_logos_2');
  const b3 = logosBbOf(chess, 'skchr_logos_3');
  const grid1 = logosGridOf(chess, 'skchr_logos_1');
  const grid3 = logosGridOf(chess, 'skchr_logos_3');

  const bounceProb = num(t0.prob, 0.4), bounceScale = num(t0.atk_scale, 0.6), bounceSlow = num(t0.sluggish, 0.8);
  const soulDur = num(t1.duration, 5), soulRes = num(t1.magic_resistance, -10), soulAdd = num(t1.atk_addition, 150);
  const killScale = num(b1['attack@kill_atk_scale'], 0.9), killDmg = num(b1['attack@kill_damage'], 9999999);
  const lockIv = Math.max(0.05, num(b2['attack@cooldown'], 0.5));
  const lockBase = num(b2['attack@atk_scale_base'], 0.35), lockDelta = num(b2['attack@atk_scale_delta'], 0.07);
  const lockMove = num(b2['attack@move_speed'], -0.06), lockStacks = Math.max(1, Math.floor(num(b2['attack@max_stack_cnt'], 10)));
  const projScale = Math.max(0.01, num(b3.projectile_move_scale, 0.05));
  const s3Targets = Math.max(1, Math.floor(num(b3['attack@max_target'], 3)));
  const modBb = moduleTalentBb(chess);
  const epRatio = num(modBb.ep_damage_ratio, 0);   // module: 8 % of the arts damage dealt → 凋亡损伤
  const bounceElem = num(t0.element_atk_scale, 0); // module upgrade of 语汇演化: 元素伤害 on an already-bursting bounce target

  const skills = {
    skchr_logos_1: {
      kind: 'toggle',
      mods: { atkPct: num(b1.atk, 0.4) },
      ...(grid1 ? { targeting: { rangeGrid: grid1 } } : {}),
      onStart({ unit }) { unit.mem.logosExec = new Map(); unit.mem.logosAcc = 0; },
      onTick({ battle, unit, dt }) {
        const m = unit.mem;
        if (!m.logosExec) { m.logosExec = new Map(); m.logosAcc = 0; }
        m.logosAcc += dt;
        if (m.logosAcc + 1e-9 < 0.1) return; // the aura sweeps 10×/s
        m.logosAcc -= 0.1;
        const inRange = battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile).filter((e) => canTargetEnemy(unit, e, ANY));
        const cur = new Set(inRange);
        // 每个目标每次进入攻击范围最多执行 1 次斩杀 — leaving the range (or dying) re-arms it
        for (const e of [...m.logosExec.keys()]) if (!cur.has(e) || !e.alive) m.logosExec.delete(e);
        for (const e of inRange) {
          if (!hasHp(e) || m.logosExec.has(e) || !(e.hp < unit.s.atk * killScale)) continue;
          m.logosExec.set(e, true);
          const hpBefore = e.hp;
          battle.fx('crit', { x: e.x, y: e.y, id: e.id, src: unit.id });
          battle.dealDamage(unit, e, { amount: killDmg, type: 'true', canDodge: false, isSkill: true, tags: ['skill', 'logos:exec'] });
          if (!hasHp(e)) { // 倒下 → one random OTHER enemy in range takes arts = the executed target's remaining HP
            const others = inRange.filter((o) => o !== e && hasHp(o) && canTargetEnemy(unit, o, ANY));
            const v = battle.rng.pick(others);
            if (v) battle.dealDamage(unit, v, { amount: hpBefore, type: 'arts', isSkill: true, tags: ['skill', 'logos:execEcho'] });
          }
        }
      },
    },
    skchr_logos_2: {
      kind: 'duration',
      duration: 20,
      mods: { resFlat: num(b2.magic_resistance, 40) },
      onStart({ battle, unit }) {
        unit.mem.logosLock = null;
        battle.addBuff(unit, { key: 'logos:s2', flags: { disarm: true } }); // the lock replaces her normal attack
      },
      onTick({ battle, unit, dt }) {
        const m = unit.mem;
        let L = m.logosLock;
        if (L && (!hasHp(L.e) || L.e.hidden || !bodyInKeys(L.e, unit.rangeKeySet))) L = m.logosLock = null; // 重新索敌且效果重置
        if (!unit.canAct) { m.logosLock = null; return; } // 被打断（晕眩 / 冻结）→ 退出锁定状态，重新索敌
        if (!L) {
          const cands = battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile).filter((e) => canTargetEnemy(unit, e, ANY));
          if (!cands.length) return;
          sortEnemyTargets(battle, unit, cands, (unit.profile && unit.profile.priority) || null);
          L = m.logosLock = { e: cands[0], stacks: 0, acc: 0 };
          battle.fx('lock', { x: L.e.x, y: L.e.y, id: L.e.id, src: unit.id });
        }
        L.acc += dt;
        if (L.acc + 1e-9 < lockIv) return;
        L.acc -= lockIv;
        L.stacks = Math.min(lockStacks, L.stacks + 1);
        // 伤害线性提高至 3 倍（base + delta·stacks），移动速度线性降低至 40%（1 + move_speed·stacks）
        battle.addBuff(L.e, {
          key: 'logos:simile', duration: lockIv * 2 + 0.2, mods: { moveMul: Math.max(0.05, 1 + lockMove * L.stacks) },
          refresh: 'replace', source: unit,
        });
        battle.dealDamage(unit, L.e, { amount: unit.s.atk * (lockBase + lockDelta * L.stacks), type: 'arts', isSkill: true, tags: ['skill', 'logos:lock'] });
      },
      onEnd({ battle, unit }) {
        unit.mem.logosLock = null;
        battle.removeBuff(unit, 'logos:s2');
      },
    },
    skchr_logos_3: {
      kind: 'duration',
      duration: 30,
      mods: { atkPct: num(b3.atk, 1.6) },
      targeting: { maxTargets: s3Targets, ...(grid3 ? { rangeGrid: grid3 } : {}) },
      onTick({ battle, unit }) {
        for (const p of battle.projectiles.list) {
          if (!p.source || p.source.side !== 'enemy') continue;
          if (!bodyInKeys(p, unit.rangeKeySet)) {
            if (p._logosBase != null) { p.speed = p._logosBase; p._logosBase = null; } // flew out: back to full speed
            continue;
          }
          if (p._logosBase == null) p._logosBase = p.speed;
          p.speed = p._logosBase * projScale;
        }
      },
      onEnd({ battle, unit, reason }) {
        const restore = (p) => { if (p._logosBase != null) { p.speed = p._logosBase; p._logosBase = null; } };
        if (reason === 'death' || !unit.alive) { for (const p of battle.projectiles.list) restore(p); return; }
        const keep = [];
        for (const p of battle.projectiles.list) {
          if (p.source && p.source.side === 'enemy' && bodyInKeys(p, unit.rangeKeySet)) {
            battle.fx('disappear', { x: p.x, y: p.y }); // 技能结束时将其全部清除
            continue;
          }
          restore(p);
          keep.push(p);
        }
        battle.projectiles.list = keep;
      },
    },
  };

  return {
    skills,
    skill: skills.skchr_logos_3, // the projection's equipped skill (chess.skill = 延异视阈)
    talents: [
      { install(battle, unit) { // 语汇演化 — 40 % per attack: a random enemy in range takes ATK × 60 % arts + 停顿 0.8 s
          battle.on('hit', (ctx) => {
            if (ctx.source !== unit || !live(unit)) return;
            const t = ctx.target, dmg = ctx.dmg;
            if (!t || t.side !== 'enemy' || !hasHp(t) || !dmg) return;
            if (!logosIsAttack(dmg) || (dmg.tags && dmg.tags.includes('logos:bounce'))) return;
            if (!battle.rng.chance(bounceProb)) return;
            const cands = battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile).filter((e) => hasHp(e) && canTargetEnemy(unit, e, ANY));
            const v = battle.rng.pick(cands);
            if (!v) return;
            battle.fx('lock', { x: v.x, y: v.y, id: v.id, src: unit.id });
            // module: "若该随机目标处于凋亡损伤爆发期间则同时造成相当于攻击力60%的元素伤害" — the burst state is read
            // BEFORE the bounce lands, so a bounce that fills the gauge itself does not retroactively qualify
            const bursting = bounceElem > 0 && !!v.findBuff(LOGOS_BURST);
            battle.dealDamage(unit, v, { amount: unit.s.atk * bounceScale, type: 'arts', isSkill: true, tags: ['skill', 'logos:bounce'] });
            battle.applyStatus(v, 'sluggish', { duration: bounceSlow, source: unit });
            if (bursting && hasHp(v)) battle.dealDamage(unit, v, { amount: unit.s.atk * bounceElem, type: 'elemental', element: 'apoptosis', canDodge: false, tags: ['talent', 'elementDmg', 'logos:bounceElem'] });
          }, { owner: unit });
      } },
      { install(battle, unit) { // 剜魂具辞 — attacks stamp a 5 s debuff (RES −10); its victim takes +150 flat arts damage
          battle.on('hit', (ctx) => {
            if (ctx.source !== unit || !live(unit)) return;
            const t = ctx.target, dmg = ctx.dmg;
            if (!t || t.side !== 'enemy' || !hasHp(t) || !dmg) return;
            if (logosIsAttack(dmg)) battle.addBuff(t, { key: LOGOS_SOUL, duration: soulDur, mods: { resFlat: soulRes }, refresh: 'extend', source: unit });
            if (dmg.type === 'arts' && (dmg.isAttack || dmg.isSkill) && t.findBuff(LOGOS_SOUL)) {
              // no flat-taken damage region in the engine: +150 pre-mitigation, RES-compensated (≈ +150 after mitigation)
              dmg.amount += soulAdd / Math.max(0.05, 1 - t.s.res / 100);
            }
          }, { owner: unit });
      } },
      { install(battle, unit) { // module 来自河谷的笔盒 — arts damage attaches ep_damage_ratio of the damage DEALT as 凋亡损伤
          if (!(epRatio > 0)) return;
          // `damaged` (not `hit`): the text says "相当于8%伤害" — the damage DEALT, i.e. post-mitigation and after the
          // target's shields, which is exactly the ctx.amount applyHpLoss reports. Element / 元素伤害 instances are
          // excluded (the text says 法术伤害, and it also keeps this from re-entering on its own fill).
          battle.on('damaged', (ctx) => {
            if (ctx.source !== unit || !live(unit)) return;
            const t = ctx.target, d = ctx.dmg;
            if (!t || t.side !== 'enemy' || !hasHp(t) || !d) return;
            if (d.type !== 'arts' || !(ctx.amount > 0)) return;
            elementDmg(battle, unit, t, 'apoptosis', ctx.amount * epRatio, ['module', 'logos:module']);
          }, { owner: unit });
      } },
    ],
  };
}

export default {
  // 罗德岛 mod (isMod projections): 逻各斯 — normal + elite share the kit (the elite's blackboards are Lv7).
  // One key: the elite `_b` record's `baseId` is `_a` (kits/README.md).
  chess_rhodes_logos_a: logos,
};
