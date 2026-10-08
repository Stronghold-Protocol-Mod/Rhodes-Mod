// mod/rhodes/kits/ops/chess_rhodes_closur.js — 罗德岛 mod 可露希尔 (chess_rhodes_closur_a/_b) 战术家 kit, tier 3.
// Extracted verbatim from the 0.1.3 tier3.js (chess_rhodes_closur_a, lines 1793–2002).
// Conventions of the tier-3 kits: ../shared/tier3.js; kit contract and rules: ../README.md.

import { num, defOf, selectedId, alive, fx, tacticalPoint, altSkills, instantKindOf } from '../shared/tier3.js';
import { canTargetEnemy } from '../../../targeting.js';
import { COLS } from '../../../constants.js';

/** 罗德岛 mod (isMod): 可露希尔's 指挥中心 (talent 1 精准投放) — the 援军 piece of data/tokens.json. */
const OURBASE_TOKEN = 'token_10066_closur_ourbase';
/** 可露希尔 S3 Q.E.D. 迟钝: `attack@slow_down` 5 %/layer move speed (elite data), ADDITIVE, ≤ `attack@slow_down_max` 50 %; the layer count lives in the enemy's `mem` (one shared counter — several 可露希尔 share ONE cap), NOT on the buff's `stacks` (buffs.js raises `*Mul` to the power of `stacks` — a buff carrying both the count and the capped `moveMul` applied the cap `n` times, driving 移速 to 0; owner, 2026-10-07). Engine 停顿 is a flat −80 % — not this effect. */
const CLOSUR_QD = 'closur:qd';
/** 可露希尔 S1 递归策略 shield on the 援军 (1 layer, no stacking). */
const CLOSUR_SHIELD = 'closur:shield';

/** Tokens `tokenId` summoned by / placed for `owner` (board pieces included). */
const tokensOf = (battle, owner, tokenId) => battle.allyUnits.filter((t) => t.kind === 'token' && t.defId === tokenId && t.ownerUnit === owner && !t.mem.isClone);

export default {
  // ---- 可露希尔 · 战术家 (chess_rhodes_closur_a/_b) — the 罗德岛 mod's 采购中心 shopkeeper (char_4228_closur),
  //      projected by tools/local-extract/build-rhodes-mod.mjs. Her 援军 is NOT the engine's generic
  //      `token_tactician_reinforce`: talent 1 精准投放 summons the **指挥中心** (token_10066_closur_ourbase — a placeable
  //      piece the mod ships in data/tokens.json), and the 指挥中心's own kit (content/tokens.js `commandCenter`) marks
  //      every operator standing in its effect range as one of her 援军 too ("效果范围内的友方单位视为自身的援军",
  //      `owner.trait.ourbaseAllies`). The tactician trait therefore reads BOTH sources: ×1.5 (the trait's `atk_scale`) vs
  //      an enemy blocked by the 指挥中心 (`trait.reinforcement`) **or** by any marked 援军 ally — see `trait.dmgMul`.
  //      天赋1 精准投放: the 指挥中心 piece, "被击败后会在15秒后自动刷新" (its own data `respawnTime` is 10, the talent
  //        text's 15 wins — implemented by the token kit).
  //      天赋2 极限调度 (`{ cost: -3, atk: 0.04 }`) [NO-ENGINE]: "携带可露希尔时，部署费用下限降低3，【罗德岛】干员攻击力
  //        +4%" is a ROSTER effect — it applies while she is only *carried*, and a kit installs into a battle; the engine
  //        has no 部署费用下限 either (see docs/MOD-RHODES.md).
  //      精锐 module TAC-X (hidden talent `damage_scale` 0.85) is also the BASE trait's own text ("援军受到来自自身阻挡
  //        单位的伤害降低15%") — applied ONCE here, to every unit the trait recognises as 援军.
  //      S1 递归策略 (AUTO, 8 s): one shield layer on the 援军 (no stacking) + 3 DP spread over the duration; every LATER
  //        use of the skill grants 1 more (≤ 7).
  //      S2 模型扩展 (MANUAL, 30 s): +7 DP at once and 15 more over the duration; the 援军 gets DEF +45 % / block +1;
  //        herself ATK +55 %, hits 2 targets and may strike what her 援军 blocks; an operator deployed inside the
  //        指挥中心's effect range refunds 40 % of its deployment cost.
  //      S3 Q.E.D. (MANUAL, 30 s, default): 18 DP over the duration, −0.5 s attack interval, attacks locked onto her OWN
  //        plus the 援军's ORIGINAL range (the union — `setExtraRange`), ×1.9 ATK physical with a 3 s 迟钝 that stacks
  //        ADDITIVELY (5 %/layer, ≤ 50 %), and one more simultaneous target every 9 attacks (≤ 6 times).
  chess_rhodes_closur_a: (bb, chess, def) => {
    const d = defOf(chess, def);
    const sel = selectedId(chess, d);
    const t0 = d.talents?.[0] ?? {};
    const mb = (d.talents || []).find((t) => t && t.bb && t.bb.damage_scale != null)?.bb ?? {};
    const ourbase = t0.tokenKey ?? (d.tokens || []).find((t) => /ourbase/.test(String(t))) ?? OURBASE_TOKEN;
    const scale = num(d.traitBb?.atk_scale, 1.5);
    const moduleCut = num(mb.damage_scale, 0.85);
    // data/chess.json: slot 1 = skchr_closur_1 递归策略 (S1), slot 2 = skchr_closur_2 模型扩展 (S2), default = S3 Q.E.D.
    const S1 = sel === 'skchr_closur_1';   // 递归策略
    const S2 = sel === 'skchr_closur_2';   // 模型扩展
    const skillOn = (u) => !!(u.skill && u.skill.active);
    /** Her 援军 piece on the field (the 指挥中心), or null. */
    const reinfOf = (u) => (u.trait.reinforcement && alive(u.trait.reinforcement) ? u.trait.reinforcement : null);
    /** Every unit the trait counts as her 援军: the 指挥中心 + the operators its effect range marks. */
    const reinfAll = (battle, u) => {
      const out = [];
      const r = reinfOf(u);
      if (r) out.push(r);
      const set = u.trait.ourbaseAllies;
      if (set) for (const a of battle.allies(u.ownerId)) if (a !== u && a.uid != null && set.has(a.uid)) out.push(a);
      return out;
    };
    /** The 援军 blocking `e` (the 指挥中心, or a marked operator), or null — what the trait's ×1.5 keys off. */
    const reinfBlocking = (unit, e) => {
      const b = e && e.blockedBy;
      if (!b) return null;
      if (b === unit.trait.reinforcement) return b;
      const set = unit.trait.ourbaseAllies;
      return set && b.uid != null && set.has(b.uid) ? b : null;
    };
    const dpGain = (battle, unit, n) => { if (n > 0) { battle.addDp(unit.ownerId, n); fx(battle, 'dp', unit, { n }); } };
    /** "技能持续时间内逐渐获得 N 点部署费用": 1 DP per step; the remainder is paid when the duration runs out. */
    const dpTick = (battle, unit, key, total, seconds, dt) => {
      const st = unit.mem[key];
      if (!st || !(total > 0)) return;
      const step = Math.max(0.05, seconds / total);
      st.acc += dt;
      while (st.paid < total && st.acc + 1e-9 >= step) { st.acc -= step; st.paid += 1; dpGain(battle, unit, 1); }
    };
    const dpFlush = (battle, unit, key, total, reason) => {
      const st = unit.mem[key];
      if (!st) return;
      if (reason === 'duration' && st.paid < total) { dpGain(battle, unit, total - st.paid); st.paid = total; }
    };
    return {
      trait: {
        dmgMul: (battle, unit, target) => (reinfBlocking(unit, target) ? scale : 1),
        install(battle, unit) {
          // ---- 天赋1 精准投放: the 指挥中心 IS her 援军 (the placed hand piece first, like 伺夜's 狼群) ----
          const spawn = () => {
            if (!alive(unit) || reinfOf(unit)) return;
            const pieces = tokensOf(battle, unit, ourbase);
            const live = pieces.find((t) => alive(t));
            if (live) { unit.trait.reinforcement = live; return; }
            const waiting = pieces.find((t) => !t.alive && !t.removed);
            if (waiting && battle.redeploy(waiting, { free: true })) {
              unit.trait.reinforcement = waiting;
              fx(battle, 'summon', waiting, { src: unit.id, token: ourbase });
              return;
            }
            const board = pieces.find((t) => t.uid != null);
            const tile = tacticalPoint(battle, unit, board ? [board.homeR, board.homeC] : null);
            if (!tile) return;
            const c = battle.spawnToken(unit, ourbase, tile[0], tile[1]);
            if (!c) return;
            unit.trait.reinforcement = c;
            fx(battle, 'summon', c, { src: unit.id, token: ourbase });
          };
          battle.on('deploy', (c) => { if (c.unit === unit) spawn(); }, { owner: unit });
          battle.on('death', (c) => {
            if (c.unit !== unit) return;
            const r = reinfOf(unit);
            if (r) battle.retreat(r, { reason: 'expired', permanent: true });   // a summon never outlives its tactician
          }, { owner: unit });
          // ---- module TAC-X: the 援军 takes 15 % less damage from the enemies IT blocks ----
          battle.on('hit', (c) => {
            const t = c.target;
            const src = c.source;
            if (!t || !src || src.side !== 'enemy' || !(moduleCut < 1)) return;
            if (!reinfAll(battle, unit).includes(t)) return;
            if (src.blockedBy === t) c.dmg.mul *= moduleCut;
          }, { owner: unit });
        },
      },
      // S3 Q.E.D. — the default skill
      skill: {
        kind: 'duration',
        mods: { batPct: num(bb.base_attack_time, -0.5) / (num(d.stats?.bat, 1) || 1) },
        attack: { atkScale: num(bb['attack@atk_scale'], 1.9) },
        targeting: { maxTargets: 1 },
        onStart({ battle, unit, skill }) {
          unit.mem.closurQdHits = 0;
          unit.mem.closurQd = { acc: 0, paid: 0 };
          const spec = (skill && skill.spec && skill.spec.targeting) || null;   // +1 target every 9 attacks, ≤ 6 times
          if (spec) spec.maxTargets = 1;
          // 锁定自身和援军原本攻击范围内的敌人: the union of her own and the 指挥中心's ORIGINAL range
          const r = reinfOf(unit);
          if (r) battle.setExtraRange(unit, r.baseRangeKeys ?? r.rangeKeys ?? []);
        },
        onTick({ battle, unit, skill, dt }) {
          const spec = (skill && skill.spec && skill.spec.targeting) || null;
          if (spec) {
            const per = Math.max(1, num(bb.attack_trigger_cnt, 9));
            const maxAdd = Math.max(0, Math.floor(num(bb.max_trigger_cnt, 6)));
            spec.maxTargets = 1 + Math.min(maxAdd, Math.floor((unit.mem.closurQdHits ?? 0) / per));
          }
          dpTick(battle, unit, 'closurQd', num(bb.cost_period, 18), num(d.skill?.duration, 30), dt);
        },
        onAttack({ unit }) { unit.mem.closurQdHits = (unit.mem.closurQdHits ?? 0) + 1; },
        onEnd({ battle, unit, reason }) {
          dpFlush(battle, unit, 'closurQd', num(bb.cost_period, 18), reason);
          battle.setExtraRange(unit, []);
        },
        onHit({ battle, unit, target }) {
          if (!target || target.side !== 'enemy' || !target.alive) return;
          const per = num(bb['attack@slow_down'], 0.05);
          const max = Math.max(1, Math.floor(num(bb['attack@max_stack_cnt'], 10)));
          const cap = num(bb['attack@slow_down_max'], 0.5);
          // The layers live in `mem`, not on the buff: the armoury's `*Mul` keys are raised to the buff's `stacks`
          // (buffs.js `Math.pow(v, st)`), so a buff carrying both `stacks: n` and the already-capped `moveMul` applied
          // the cap `n` times (0.5^10 ≈ 0.001 ⇒ 移速 0). One shared counter per enemy also makes several 可露希尔 share
          // ONE 迟钝 cap, as the text reads, instead of each keeping its own (owner, 2026-10-07; cf. 逻各斯 §… same
          // mem + plain moveMul shape). `mem` is per-unit, so the counter is shared by every 可露希尔 attacking it.
          const n = Math.min(max, (target.mem[CLOSUR_QD] ?? 0) + 1);
          target.mem[CLOSUR_QD] = n;
          battle.addBuff(target, {
            key: CLOSUR_QD, duration: num(bb['attack@slow_down_time'], 3), refresh: 'replace', source: unit, visible: true,
            mods: { moveMul: Math.max(0, 1 - Math.min(cap, per * n)) },
            // the layers decay with the slow: once nothing refreshed it for its duration the counter is back to 0
            onExpire: ({ unit: e }) => { e.mem[CLOSUR_QD] = 0; },
          });
        },
      },
      // S1 递归策略 (AUTO) / S2 模型扩展 (MANUAL) — every non-default skill of the chess has its own spec (DESIGN §16)
      skills: altSkills(chess, d, bb, {
        skchr_closur_1: (s) => ({
          kind: instantKindOf(s),
          trigger: 'SP_FULL',
          onStart({ battle, unit }) {
            // "每使用过一次技能，获得的部署费用+1（最多提升至7点）" — this cast is use number `closurS1Use`
            unit.mem.closurS1Use = (unit.mem.closurS1Use ?? 0) + 1;
            unit.mem.closurS1 = { acc: 0, paid: 0 };
            unit.mem.closurS1Total = Math.min(
              num(s.bb.cost_add_max, 7),
              num(s.bb.cost, 3) + Math.max(0, unit.mem.closurS1Use - 1) * num(s.bb.cost_per_add, 1),
            );
            // "立即使自身的援军获得1层护盾（不叠加）": one layer = the engine's hit-count shield (`shieldHits`, as in
            // 雪猎's 铁弦) — the official blackboard carries the layer COUNT (`shield_cnt`) and no shield value.
            const layer = Math.max(1, Math.floor(num(s.bb.shield_cnt, 1)));
            for (const a of reinfAll(battle, unit)) {
              battle.addBuff(a, { key: CLOSUR_SHIELD, shieldHits: layer, visible: true, source: unit });
            }
          },
          onTick({ battle, unit, dt }) {
            dpTick(battle, unit, 'closurS1', num(unit.mem.closurS1Total, 3), Math.max(1, num(s.duration, 8)), dt);
          },
          onEnd({ battle, unit, reason }) { dpFlush(battle, unit, 'closurS1', num(unit.mem.closurS1Total, 3), reason); },
        }),
        skchr_closur_2: (s) => ({
          kind: 'duration',
          mods: { atkPct: num(s.bb.atk, 0.55) },
          targeting: { maxTargets: Math.max(1, Math.floor(num(s.bb['attack@max_target'], 2))) },
          onStart({ battle, unit }) {
            dpGain(battle, unit, num(s.bb.cost, 7));
            unit.mem.closurS2 = { acc: 0, paid: 0 };
          },
          onTick({ battle, unit, dt }) {
            dpTick(battle, unit, 'closurS2', num(s.bb.cost_period, 15), Math.max(1, num(s.duration, 30)), dt);
          },
          onEnd({ battle, unit, reason }) { dpFlush(battle, unit, 'closurS2', num(s.bb.cost_period, 15), reason); },
        }),
      }),
      install(battle, unit) {
        // ---- S2 模型扩展: the 援军 DEF +45 % / block +1 (only while S2 runs) ----
        if (S2) {
          const mods = { defPct: num(bb.def, 0.45), blockCnt: Math.max(0, num(bb.block_cnt, 1)) };
          battle.every(0.25, () => {
            if (!alive(unit) || !skillOn(unit)) return;
            for (const a of reinfAll(battle, unit)) {
              battle.addBuff(a, { key: `closur:extend:${unit.id}`, duration: 0.5, refresh: 'replace', mods, source: unit });
            }
          }, { owner: unit });
          // "在战术点效果范围内部署干员时，立即返还部署费用的40%" — a redeploy pays the piece's DP cost, so a unit coming
          // back onto a tile of the 指挥中心's effect range refunds 40 % of it
          const back = num(bb.cost_return, 0.4);
          battle.on('deploy', (c) => {
            const u = c.unit;
            if (!u || u.side !== 'ally' || u.kind !== 'op' || u === unit || !skillOn(unit)) return;
            const r = reinfOf(unit);
            if (!r || !(back > 0)) return;
            if (!(r.rangeKeySet || new Set(r.rangeKeys)).has(u.tileR * COLS + u.tileC)) return;
            dpGain(battle, unit, Math.max(0, num(u.base?.cost, 0) * back));
          }, { owner: unit });
          // "同时攻击2个目标且能攻击到自身援军阻挡的敌人": the engine adds only the enemies SHE blocks, so what her 援军
          // blocks is appended to the target list while the skill runs
          battle.on('beforeAttack', (c) => {
            if (c.attacker !== unit || !skillOn(unit)) return;
            const set = unit.rangeKeySet || new Set(unit.rangeKeys);
            const prof = c.profile || unit.profile;
            for (const e of battle.enemies) {
              if (!e.alive || e.hidden || c.targets.includes(e) || !reinfBlocking(unit, e)) continue;
              if (!canTargetEnemy(unit, e, prof)) continue;
              if (!set.has(Math.round(e.y) * COLS + Math.round(e.x))) continue;
              c.targets.push(e);
            }
          }, { owner: unit, priority: 20 });
        }
      },
    };
  },
};
