// tools/game-root.mjs — 找到《卫戍协议：盟约》的游戏根目录。
//
// 找法（按顺序）：
//   1. 显式传入的路径（--game <路径> / 环境变量 SP_GAME）
//   2. 从本文件所在目录往上找，看哪一层有 name 为 stronghold-protocol-alliance 的 package.json
//      —— 无论 mod 是解压成 <游戏>/.rhodes-mod/ 还是在 <游戏>/ 里就地解压，都能找到
//
// 返回值一律是绝对路径；找不到返回 null。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GAME_PKG = 'stronghold-protocol-alliance';

/** 这个目录看起来是游戏根目录吗？ */
export function isGameRoot(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return pkg && pkg.name === GAME_PKG;
  } catch {
    return false;
  }
}

/** 游戏根目录的版本号，读不出返回 null。 */
export function gameVersion(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version || null; } catch { return null; }
}

/**
 * @param {string} [explicit] --game 传入的路径
 * @returns {string|null} 绝对路径
 */
export function findGameRoot(explicit) {
  const given = explicit || process.env.SP_GAME;
  if (given) {
    const abs = path.resolve(given);
    return isGameRoot(abs) ? abs : null;
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i += 1) {
    if (isGameRoot(dir)) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}
