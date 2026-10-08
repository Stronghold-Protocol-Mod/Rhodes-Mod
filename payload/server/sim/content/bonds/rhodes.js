// server/sim/content/bonds/rhodes.js — 罗德岛 (Rhodes Island), the custom faction bond.
//
// Every number comes from data/bonds.json (`env_gbuff_new` blackboard of `rhodesShip`), layers are read LIVE
// (`bondLayers`) so an in-battle gain needs no recompute.
//
//   3 distinct  members  heals & HP-regen a member RECEIVES are +(heal_taken_base + heal_taken_per_stack·L). The boost
//                        rides the heal pipeline's `heal` hook, so it covers medic attacks, auras that heal, self-heals
//                        and 生命回复 regeneration alike. **The bond gains NO layers in battle** (user ruling
//                        2026-10-06): the old `layer_heal_step` accumulator (1 layer per 200 HP a member healed, ≤ 40 a
//                        battle) was deleted — it made a healing board's 罗德岛 counter jump by up to +40 a round on top
//                        of the operators' own 特质, which read as 「异常叠层」. 罗德岛 layers now come only from the
//                        prep side and from the layer 特质 of its operators (阿米娅·医疗 / 阿斯卡纶 / 凯尔希·思衡托 /
//                        Mon3tr / 暴行).
//   6 distinct  members  the overflow of a heal landing on a member becomes the member's OWN barrier, and every
//                        enemy-sourced damage instance that chews that barrier detonates: (shield_break_damage +
//                        shield_break_damage_per_stack·L) TRUE damage to every enemy within shield_break_radius tiles
//                        (周围 8 格 — the 3×3 box radius 1.5 draws), ≤ once per shield_break_cd per member. There is no
//                        lethal-hit save any more (user decision 2026-10-05: the barrier is pure offense now).
//                        ALSO (user decision 2026-10-06): the bond's HEALERS may heal ANY healable ally of their range
//                        once nobody in range needs healing — a random one, full HP included, 禁疗 excluded. Without
//                        it a medic simply stops attacking at full HP (the engine's injured-first rule), so a board
//                        that is topped up banks no barrier at all and the equipment that reads heals has nothing to
//                        read. Opted in via `unit.mem.healAnyAlly` (ai.js acquireTargets, Battle.healableAlliesInKeys).
//
// The barrier is a 屏障 in 砾's sense (`gravel:rats`, kits/tier2.js): a `shield` buff that soaks damage before HP,
// capped at the member's max HP (engine `opts.overheal` rule). The ONE thing it does not take from 砾 is the decay —
// 砾's barrier carries `interval: 1` + an `onTick` that rescales its remaining capacity once a second, while this one
// is written with `duration: Infinity`, `interval: 0` and no `onTick` (the same "permanent 屏障" shape
// `decayingShield(tier6.js)` builds when its duration is 0), so a shield banked early in the fight is still worth
// exactly as much at the end of it. `test/content/bonds_rhodes.test.js` pins that difference down against 砾's kit.
//
// The detonation rides the `hit` / `damaged` hook pair: `hit` runs before the shields absorb (snapshot), `damaged`
// after — the difference is what the enemy hit chewed off, whether or not the barrier broke. Damage dealt by the
// detonation is sourceless (`sourceless: true`): no attacker multipliers apply, but it is not credited to anyone
// either — the same convention 坚守's thorns / element bursts use.
//
// The barrier only ever sits on a member. Medics pick an INJURED ally first (and would only heal a full-HP ally via
// Mon3tr the 链愈师's full-HP chain jumps — the engine's heal target rule is unchanged), so in practice the barrier
// banks from heals that overflow past a member's missing HP, from Mon3tr's jumps, and from 生命回复 regeneration on a
// full-HP member. 禁疗 (healFree / noHeal) summons stay unhealable throughout.

import {
  num, bondRecord, buffParams, bondTier, bondLayers, isMember, playerOps, fxOn,
} from '../support/index.js';

export const ID = 'rhodesShip';

/**
 * The shield key the engine's overheal rule writes (`server/sim/damage.js` heal()): `{ key: 'overheal', shield, duration:
 * Infinity }` — no `interval`/`onTick`, i.e. a 屏障 that never decays (砾's `gravel:rats` is the decaying counterpart).
 */
const SHIELD_KEY = 'overheal';
const FX_KEY = 'bond:rhodesShip';
const MEM_SHIELD_BEFORE = 'rhodesShieldBefore';
const MEM_BREAK_AT = 'rhodesBreakAt';
/**
 * `unit.mem` key read by `server/sim/ai.js acquireTargets` (see the header): a healer carrying it falls back to a
 * RANDOM healable ally of its range — full HP included — once nobody in range needs healing. The NAME is a generic
 * capability, not a 罗德岛 one, so any other content can opt into the same rule.
 */
const MEM_HEAL_ANY = 'healAnyAlly';

/** `env_gbuff_new` blackboard of the bond (numbers only). */
export function bondBb() {
  return buffParams(bondRecord(ID), 'env_gbuff_new') ?? {};
}

export function install(battle) {
  if (!battle || !Array.isArray(battle.players) || !battle.players.length) return;

  const states = [];
  for (const p of battle.players) {
    const tier = bondTier(battle, p.playerId, ID);
    if (tier <= 0) continue;
    states.push({
      pid: p.playerId,
      tier,
      bb: bondBb(),
      members: new Set(playerOps(battle, p.playerId).filter((u) => isMember(battle, u, ID))),
    });
  }
  if (!states.length) return;

  // -------------------------------------------------------------------------------------------------------------------
  // 6 distinct — the bond's HEALERS may pick ANY healable ally of their range once nobody needs healing

  // A heal on a full-HP ally restores nothing, but it runs the whole heal pipeline, so the `heal` hook still sees the
  // nominal amount — which is exactly what banks the overflow barrier below and what 罗德岛徽章 turns into damage. The
  // flag is read by ai.js acquireTargets; `mem` is the per-unit scratch space for content (units.js `this.mem = {}`)
  // and is never cleared, so it survives a knock-out / redeploy, and every op of the player already exists when
  // install() runs (playerOps has no `fieldOnly`), so a healer deployed later carries it too.
  for (const st of states) {
    if (st.tier < 2) continue;
    for (const u of st.members) {
      if (u.profile && u.profile.heal && u.profile.dmgType === 'heal') u.mem[MEM_HEAL_ANY] = true;
    }
  }

  const byPid = Object.create(null);
  for (const st of states) byPid[st.pid] = st;
  const L = (st) => bondLayers(battle, st.pid, ID);
  const shieldOf = (u) => {
    const b = typeof u.findBuff === 'function' ? u.findBuff(SHIELD_KEY) : null;
    return b && b.shield > 0 ? b.shield : 0;
  };
  /** the per-player state of a member operator / its shield owner */
  const stateOf = (u) => (u && u.side === 'ally' && u.kind === 'op' ? byPid[u.ownerId] : null);

  // -------------------------------------------------------------------------------------------------------------------
  // 3 distinct — healing & HP-regen a member receives is boosted; a member's healing funds the layers;
  //             6 distinct — a heal landing on a member overflows into the member's own barrier

  battle.on('heal', (c) => {
    const target = c.target;
    const tst = stateOf(target);
    // the received boost runs first so the barrier sees the boosted amount
    if (tst && tst.members.has(target)) {
      const cfg = tst.bb;
      c.amount *= 1 + num(cfg.heal_taken_base) + num(cfg.heal_taken_per_stack) * L(tst);
      if (tst.tier >= 2) c.opts.overheal = true;
    }
  });

  // -------------------------------------------------------------------------------------------------------------------
  // 6 distinct — every enemy hit that chews a member's barrier detonates it (true damage, 周围 8 格, per-member CD)

  if (!states.some((st) => st.tier >= 2)) return;

  // `hit` runs before the shields absorb, `damaged` after: the pair tells us how much of the barrier the hit chewed
  battle.on('hit', (c) => {
    const t = c.target;
    const st = stateOf(t);
    if (!st || st.tier < 2 || !st.members.has(t)) return;
    t.mem[MEM_SHIELD_BEFORE] = shieldOf(t);
  });

  battle.on('damaged', (c) => {
    const t = c.target;
    const st = stateOf(t);
    if (!st || st.tier < 2 || !st.members.has(t)) return;
    const before = t.mem[MEM_SHIELD_BEFORE];
    const now = shieldOf(t);
    t.mem[MEM_SHIELD_BEFORE] = now;
    if (!(before > 0) || now >= before) return;      // no barrier, or this hit did not chew it
    const src = c.source;
    if (!src || src.side !== 'enemy') return;        // 因敌人攻击 — friendly / sourceless chips do not detonate
    if (battle.time - (t.mem[MEM_BREAK_AT] ?? -Infinity) < num(st.bb.shield_break_cd, 1)) return;
    t.mem[MEM_BREAK_AT] = battle.time;

    const cfg = st.bb;
    const amount = num(cfg.shield_break_damage) + num(cfg.shield_break_damage_per_stack) * L(st);
    const radius = num(cfg.shield_break_radius, 1.5);
    fxOn(battle, 'shieldBreak', t, FX_KEY, 'break', { r: radius });
    if (!(amount > 0)) return;
    for (const e of battle.enemiesInRadius(t.x, t.y, radius) || []) {
      if (!e || !e.alive) continue;
      const d = battle.makeDamage({ amount, type: 'true', canDodge: false, sourceless: true, tags: [`${FX_KEY}:break`] });
      battle.dealDamage(null, e, d);
    }
  });
}

/**
 * Prep side: the bond has no 休整期 behaviour of its own. Its layers come from the generic prep sources (buying /
 * selling, 休整期 income) and from the layer 特质 of its operators — not from this file, and (since 2026-10-06) not
 * from healing either.
 */
export function registerMeta() {}
