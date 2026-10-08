// mod/rhodes/kits/ops/chess_rhodes_monstr.js — 罗德岛 mod Mon3tr (chess_rhodes_monstr_a/_b) 链愈师 kit, tier 4.
// Extracted verbatim from the 0.1.3 tier4.js (chess_rhodes_monstr_a, lines 2217–2375).
// Conventions of the tier-4 kits: ../shared/tier4.js; kit contract and rules: ../README.md.

import { num, tbb, grid, batFlat, keySet, skillActive, isSel, alt, instantKind } from '../shared/tier4.js';
import { normalizeChess } from '../../../simdata.js';
import { COLS } from '../../../constants.js';

/** 罗德岛 mod (isMod): Mon3tr's 重构体 (talent 1 自我修复) — the 援军-like piece of data/tokens.json. */
const REBUILD_TOKEN = 'token_10050_monstr_prosts';

export default {
  // ---- Mon3tr · 链愈师 (chess_rhodes_monstr_a/_b) — the 罗德岛 mod's healer (char_4179_monstr), projected by
  //      tools/local-extract/build-rhodes-mod.mjs. 特性 (professions.js `chainhealer`): a heal that jumps between
  //      `attack@chain.max_target` (3) allies, losing 15 % (`1 − atk_scale`) per jump.
  //      天赋1 自我修复 — the 重构体 (token_10050_monstr_prosts, a placed piece of data/tokens.json): "仅可被自身治疗"
  //        (the token kit zeroes every heal that is not Mon3tr's), the trait's 80 HP/s drain, +15 % ATK to the allies
  //        around it, and "重构体受到自身和Mon3tr治疗时，可额外进行一次不会衰减的治疗跳跃" — every heal Mon3tr lands ON it
  //        adds one FULL-STRENGTH jump out of it (`jump`: ai.js doHeal's bounce without the falloff).
  //      天赋2 战术协同 (`{ attack_speed: 20, buff_duration: 10 }`): whenever Mon3tr OR the 重构体 heals, the target AND
  //        Mon3tr gain +20 ASPD for 10 s — one instance ("无法叠加"), refreshed.
  //      S1 策略：超压链接 (AUTO, 3 SP): the NEXT heal restores ATK × 170 % and jumps one more time (the blackboard's
  //        ABSOLUTE `chain.max_target` 4). Patched onto `unit.profile` (healScale / heal.count), restored by the first
  //        heal that consumes it — the same fields ai.js doHeal reads.
  //      S2 策略：超负荷 (MANUAL, 30 s): while it runs she heals the 重构体 FIRST (a `beforeAttack` rewrite of the heal
  //        target), every heal that lands on it still adds its jump, and 战术协同 is ×`talent_scale` (2.3 ⇒ +46 ASPD).
  //      S3 策略：熔毁 (MANUAL, 25 s, default): she consumes the 重构体 and takes its tile (a 移动), ATK +280 %, −1.5 s
  //        attack interval, block +2, max HP +5000, hits every enemy she blocks, damage becomes TRUE and each attack
  //        heals her ATK × 50 %. 80 HP/s drain (fatal-capable). When the skill ends — or on a fatal hit — she returns to
  //        the tile she started from.
  chess_rhodes_monstr_a: (bb, chess, def) => {
    const d = def ?? normalizeChess(chess);
    const t0 = tbb(d, 0), t1 = tbb(d, 1);
    const S1 = isSel(d, 'skchr_monstr_1');
    const S2 = isSel(d, 'skchr_monstr_2');
    const S3 = isSel(d, 'skchr_monstr_3');
    const bodyId = t0.tokenKey ?? REBUILD_TOKEN;
    const s3Grid = grid(d.skill?.rangeGrid ?? null);
    /** Her 重构体 piece standing on the field. */
    const bodyOf = (battle, u) => battle.allyUnits.find((t) => t.kind === 'token' && t.defId === bodyId && t.ownerUnit === u && t.alive && t.deployed) ?? null;
    /** The 重构体 piece that S3 put off the field without removing (it redeploys on its 初始位置 at the skill's end). */
    const waitingBodyOf = (battle, u) => battle.allyUnits.find((t) => t.kind === 'token' && t.defId === bodyId && t.ownerUnit === u && !t.alive && !t.removed) ?? null;
    /** 战术协同: +attack_speed for 10 s on the healed target and on Mon3tr ("无法叠加" ⇒ one refreshed instance). */
    const tactical = (battle, unit, target) => {
      const aspd = num(t1.attack_speed, 20) * (S2 ? num(bb.talent_scale, 2.3) : 1);
      if (!(aspd > 0)) return;
      for (const a of [target, unit]) {
        if (a) battle.addBuff(a, { key: `monstr:tactical:${unit.id}`, duration: num(t1.buff_duration, 10), refresh: 'replace', visible: true, source: unit, mods: { aspd } });
      }
    };
    /** One FULL-STRENGTH jump out of `prev` (自我修复) — ai.js doHeal's bounce, no falloff, 禁疗 targets skipped. */
    const jump = (battle, unit, prev, amount, seen) => {
      const pool = [];
      for (const a of battle.alliesInRadius(prev.x, prev.y, 2.5, null)) {
        if (seen.has(a.id) || a.kind === 'device' || a.s.flags.noHeal || (a.profile && a.profile.noHeal)) continue;
        if (!battle.allySelectable(a, unit)) continue;
        pool.push(a);
      }
      if (!pool.length) return null;
      // injured first (lowest HP ratio); an all-full range jumps to a random full-HP ally (链愈师 "可选择满生命
      // 我方单位为跳跃目标" — the overflow feeds 罗德岛's barrier), matching ai.js doHeal's chain rule
      const injured = pool.filter((a) => a.hp < a.s.maxHp - 1e-6);
      const best = injured.length
        ? injured.reduce((m, a) => (a.hpRatio < m.hpRatio ? a : m))
        : battle.rng.pick(pool);
      seen.add(best.id);
      battle.fx('heal', { x: best.x, y: best.y, id: best.id, src: unit.id });
      battle.heal(unit, best, amount);
      return best;
    };
    return {
      install(battle, unit) {
        // The 罗德岛 layer gain on every skill cast is Mon3tr's 特质 now — data/garrisons.json
        // `garrison_rhodes_monstr_a/_b` on the official `act1autochess_gar_event_useskill` event
        // (garrisons/battle.js INSTALLERS), so the kit never touches layers: user ruling 2026-10-06 (third pass), a
        // 层数 effect is a 特质 in this game (compare 阿米娅·医疗 / 阿斯卡纶 / 凯尔希·思衡托). Same numbers as the
        // `modTalents` record it replaced — +6 a cast normal / +12 精锐, at most 4 casts a battle (24 / 48 layers).
        /** 熔毁's "返回初始位置" (the skill's end, or a fatal hit): the tile she cast it from + her 重构体 back. */
        const returnHome = () => {
          const home = unit.mem.monstrHome;
          unit.mem.monstrHome = null;
          if (home && (unit.tileR !== home[0] || unit.tileC !== home[1])) battle.moveRedeploy(unit, home[0], home[1], { clearSp: false });
          // the 重构体 the cast took off the field comes back on ITS 初始位置 — "S3结束后重构体重新出现" (the user's ruling):
          // the piece was never removed, only taken off the field, so a free redeploy restores it at once, full HP
          const body = bodyOf(battle, unit) ?? waitingBodyOf(battle, unit);
          if (body && !body.alive) battle.redeploy(body, { free: true });
        };
        // ---- 重构体被击杀后按其 respawnTime 复活 (mod-local rule, user ruling 2026-10-08) ----
        // The author's engine removes summons for good: deploy.js `_remove` only gives `kind === 'op'` a `respawnAt`,
        // everything else (`token` / `device`) is `removed = true` at once — docs/design/engine.md: "summons, devices and
        // enemies leave at once". Mon3tr's 重构体 is the exception the user asked for: a killed body lies down
        // (`removed = false` keeps it out of `_releaseRemoved`) and comes back on its tile after `stats.respawnTime`
        // (15 s in data/tokens.json), free, at full HP — the very `!alive && !removed` state S3's returnHome already
        // uses. `death` fires BEFORE the `_toRelease.push` (deploy.js), so the flag write sticks.
        battle.on('death', (c) => {
          const body = c.unit;
          if (!body || body.kind !== 'token' || body.defId !== bodyId || body.ownerUnit !== unit) return;
          if (c.reason !== 'killed') return;                     // S3's own 'expired' retreat redeploys it itself
          const wait = Math.max(0, num(body.base?.respawnTime, 0));
          if (!(wait > 0)) return;
          body.removed = false;                                  // keep the piece (down, not released)
          const backAt = body.deathAt + wait;
          const timer = battle.every(0.25, () => {
            if (body.alive || body.removed) { timer.cancel(); return; }   // back (or gone for another reason)
            if (battle.time + 1e-9 < backAt) return;
            if (battle.redeploy(body, { free: true })) timer.cancel();    // full HP, its own tile, no DP
          }, { owner: unit });
        }, { owner: unit });
        battle.on('heal', (c) => {
          // 超压链接: the first heal after the cast IS the "next" one — restore the profile the skill patched
          if (S1 && c.source === unit && unit.mem.monstrLink) {
            unit.mem.monstrLink = false;
            unit.profile.healScale = unit.mem.monstrHealScale0;
            if (unit.profile.heal) unit.profile.heal.count = unit.mem.monstrCount0;
          }
          if (c.source !== unit || !(c.amount > 0)) return;
          tactical(battle, unit, c.target);                                    // 战术协同 (自身造成治疗时)
          const body = bodyOf(battle, unit);
          // 重构体受到Mon3tr治疗 → 一次不会衰减的治疗跳跃
          if (body && c.target === body) jump(battle, unit, body, c.amount, new Set([body.id]));
        }, { owner: unit });
        // 重构体造成治疗时 also arms 战术协同 (a heal whose source is the 重构体 itself)
        battle.on('heal', (c) => {
          const body = bodyOf(battle, unit);
          if (body && c.source === body && c.amount > 0) tactical(battle, unit, c.target);
        }, { owner: unit, priority: 5 });
        // ---- S2 超负荷: 技能期间优先治疗重构体 ----
        if (S2) {
          battle.on('beforeAttack', (c) => {
            if (c.attacker !== unit || !skillActive(unit) || !c.profile || !c.profile.heal) return;
            const body = bodyOf(battle, unit);
            if (!body || body.hp >= body.s.maxHp) return;
            if (!keySet(unit).has(body.tileR * COLS + body.tileC)) return;
            const i = c.targets.indexOf(body);
            if (i > 0) c.targets.splice(i, 1);
            if (i !== 0) c.targets.unshift(body);
          }, { owner: unit, priority: 20 });
        }
        // ---- S3 熔毁 ----
        if (!S3) return;
        // "场上不存在重构体时，技能不能开启" — the cast needs the 通常形态 body standing (skills.js activate gate); the SP is
        // kept, so she casts the moment her body is back on the field
        unit.canActivate = (sk) => (sk !== unit.skill ? undefined : !!bodyOf(battle, unit));
        const drain = num(bb.damage_per_second, 80);
        if (drain > 0) {
          battle.every(1, () => {
            if (!unit.alive || !unit.deployed || !skillActive(unit)) return;
            battle.loseHp(unit, drain, { source: unit, silent: true, tags: ['skill', 'monstr:meltdown'] });
          }, { owner: unit });
        }
        battle.on('skillStart', (c) => {
          if (c.unit !== unit) return;
          const hr = unit.tileR, hc = unit.tileC;                               // her 初始位置 — the tile she returns to
          const body = bodyOf(battle, unit);
          // "场上不存在重构体时，技能不能开启": the cast needs the 重构体 standing (also gated in `canActivate`)
          if (!body) return;
          const r = body.tileR, col = body.tileC;                               // 移动至重构体位置 (the body leaves the field)
          unit.mem.monstrHome = [hr, hc];
          // "撤退场上的重构体" — but NOT for good (the user's ruling: S3结束后重构体重新出现): the piece goes off the field
          // with its hooks kept (`removed = false`, like a tactician's 援军 waiting to come back), and the skill's end
          // redeploys it on this very tile (returnHome) — no beacon, no respawn timer, no DP
          battle.retreat(body, { reason: 'expired', permanent: false });
          body.removed = false;
          // 移动 to the body's tile (after the retreat: her own tile must be free for nothing — she vacates it)
          if (r == null || col == null || !battle.moveRedeploy(unit, r, col, { clearSp: false })) {
            unit.mem.monstrHome = null;
            battle.redeploy(body, { free: true });
          }
        }, { owner: unit, priority: 50 });
        battle.on('skillEnd', (c) => { if (c.unit === unit) returnHome(); }, { owner: unit });
        battle.on('fatal', (c) => { if (c.unit === unit && !c.prevented) returnHome(); }, { owner: unit, priority: 50 });
      },
      // S3 熔毁 — the default skill
      skill: {
        kind: 'duration',
        mods: {
          atkPct: num(bb.atk, 2.8),
          hpFlat: num(bb.max_hp, 5000),
          blockCnt: num(bb.block_cnt, 2),
          batPct: batFlat(d, bb.base_attack_time),
        },
        ...(s3Grid ? { targeting: { rangeGrid: s3Grid } } : {}),
        attack: {
          dmgType: 'true',
          hitAllBlocked: true,
          onEachHit({ battle, unit }) {   // 攻击治疗自身相当于攻击力50%的生命值
            const hs = num(bb['attack@heal_scale'], 0.5);
            if (hs > 0 && unit.alive) battle.heal(unit, unit, unit.s.atk * hs, { self: true, tags: ['skill', 'monstr:meltdown'] });
          },
        },
      },
      skills: alt(d, {
        skchr_monstr_1: () => ({         // 超压链接: the next heal is ×atk_scale and jumps one more time
          kind: instantKind(d),
          trigger: 'SP_FULL',
          onStart({ unit }) {
            if (!unit.profile) return;
            unit.mem.monstrHealScale0 = unit.profile.healScale ?? 1;
            unit.mem.monstrCount0 = unit.profile.heal?.count ?? 3;
            unit.profile.healScale = num(bb.heal_scale, 1.7);
            if (unit.profile.heal) unit.profile.heal.count = Math.max(1, Math.floor(num(bb['chain.max_target'], 4)));
            unit.mem.monstrLink = true;
          },
        }),
        skchr_monstr_2: () => ({         // 超负荷: 战术协同 ×talent_scale while it runs (see `tactical`)
          kind: 'duration',
        }),
      }),
    };
  },
};
