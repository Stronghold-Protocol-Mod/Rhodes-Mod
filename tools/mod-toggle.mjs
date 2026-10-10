// tools/mod-toggle.mjs — 命令行开关：把 mod/variants/<id>/{on,off} 的文件拷进 data/。
//
//   node tools/mod-toggle.mjs on|off|status [--toggle rhodes] [--game <游戏根目录>]
//
// 和网页里那个徽标开关是同一件事（同样只切 mod/toggles.json 登记的数据文件，罗德岛是 7 个），区别只是从终端做。
// 七个临时文件全部写完才逐个 rename，失败只会留下旧状态或新状态、不会半写；切完再从磁盘回读标记确认。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findGameRoot } from './game-root.mjs';

/** @typedef {{ id: string, name: string, files: string[], marker: { file: string, key: string } }} Toggle */

/** 读注册表。 @returns {Toggle[]} */
export function listToggles(root) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'mod', 'toggles.json'), 'utf8'));
    const list = Array.isArray(raw.toggles) ? raw.toggles : [];
    return list.filter((t) => t && typeof t.id === 'string' && Array.isArray(t.files) && t.marker?.file && t.marker?.key);
  } catch {
    return [];
  }
}

/** 磁盘上真实的开关状态；null 表示读不出来。 @returns {boolean|null} */
export function readModState(root, toggle) {
  try {
    const rec = JSON.parse(fs.readFileSync(path.join(root, 'data', `${toggle.marker.file}.json`), 'utf8'));
    return !!(rec && typeof rec === 'object' && rec[toggle.marker.key]);
  } catch {
    return null;
  }
}

/**
 * 切换开关。
 * @param {string} root 游戏根目录
 * @param {{ id?: string, on: boolean }} opts
 * @returns {{ ok: true, id: string, on: boolean, changed: boolean } | { ok: false, detail: string }}
 */
export function setModState(root, { id, on }) {
  const list = listToggles(root);
  if (!list.length) return { ok: false, detail: 'mod/toggles.json 读不出任何开关（文件缺失或格式不对）' };
  const toggle = id ? list.find((t) => t.id === id) : list[0];
  if (!toggle) return { ok: false, detail: `注册表里没有开关 "${id}"（有：${list.map((t) => t.id).join(', ')}）` };

  const before = readModState(root, toggle);
  if (before === on) return { ok: true, id: toggle.id, on, changed: false };

  const dir = path.join(root, 'mod', 'variants', toggle.id, on ? 'on' : 'off');
  /** @type {[string, string][]} */
  const staged = [];
  try {
    for (const name of toggle.files) {
      const buf = fs.readFileSync(path.join(dir, `${name}.json`));
      if (name === toggle.marker.file) {
        const parsed = JSON.parse(buf.toString('utf8'));
        const has = !!(parsed && parsed[toggle.marker.key]);
        if (has !== on) return { ok: false, detail: `mod/variants/${toggle.id}/${on ? 'on' : 'off'}/${name}.json 与请求的状态不一致` };
      }
      const target = path.join(root, 'data', `${name}.json`);
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, buf);
      staged.push([tmp, target]);
    }
    for (const [tmp, target] of staged) fs.renameSync(tmp, target);
  } catch (e) {
    for (const [tmp] of staged) { try { fs.unlinkSync(tmp); } catch { /* 已 rename 或不存在 */ } }
    return { ok: false, detail: `${e.code || e.message}` };
  }

  const after = readModState(root, toggle);
  if (after !== on) return { ok: false, detail: `写完回读仍是 ${after === null ? '读不出' : after ? 'ON' : 'OFF'}` };
  return { ok: true, id: toggle.id, on, changed: true };
}

// ------------------------------------------------------------------ CLI -----

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
  const root = findGameRoot(arg('game'));
  if (!root) { console.error('× 找不到游戏根目录（用 --game <路径> 指定）'); process.exit(1); }
  const action = (argv.find((a) => !a.startsWith('--') && a !== arg('game') && a !== arg('toggle')) || 'status').toLowerCase();

  if (action === 'status') {
    for (const t of listToggles(root)) {
      const s = readModState(root, t);
      console.log(`  ${t.name || t.id}: ${s === null ? '读不出' : s ? '已开启 (ON)' : '已关闭 (OFF)'}`);
    }
    process.exit(0);
  }
  if (action !== 'on' && action !== 'off') { console.error(`× 用法：node tools/mod-toggle.mjs on|off|status [--game <路径>]`); process.exit(1); }

  const res = setModState(root, { id: arg('toggle'), on: action === 'on' });
  if (!res.ok) { console.error(`× ${res.detail}`); process.exit(1); }
  console.log(res.changed ? `  ${res.id} → ${res.on ? 'ON' : 'OFF'}（请重新载入浏览器里的页面）` : `  ${res.id} 已经是 ${res.on ? 'ON' : 'OFF'}`);
}
