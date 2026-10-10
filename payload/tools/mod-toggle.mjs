// tools/mod-toggle.mjs — 命令行开关：把 mod/variants/<id>/{on,off} 的文件拷进 data/。FRAMEWORK, not a mod: one CLI
// serves every content switch of the checkout.
//
//   node tools/mod-toggle.mjs on|off|status [<id>] [--toggle <id>] [--game <游戏根目录>]
//
//   node tools/mod-toggle.mjs status                     每一片注册表的状态
//   node tools/mod-toggle.mjs on rhodes                  开罗德岛
//   node tools/mod-toggle.mjs off danmaku                关弹幕
//   node tools/mod-toggle.mjs on                         只装了一个 mod 时可以省略 id
//
// 和网页里那个徽标开关是同一件事（同样只切**该 mod 自己登记的那些**数据文件，罗德岛是 7 个、弹幕是 1 个），区别只是从
// 终端做。注册表是「一个 MOD 一片」的 mod/toggles.d/<id>.json；本工具**读的是游戏服务端自己的那份读取器**
// （server/mod/registry.js，由框架随包装入），所以「哪些开关存在」与服务器看到的永远是同一份答案 —— 格式只有一处实现。
// 这也正是两个 MOD 互不干扰的机制：切一个只写它列出的文件，装第二个 MOD 只是多一个文件、永远不会改写第一个的条目。
//
// 临时文件全部写完才逐个 rename，失败只会留下旧状态或新状态、不会半写；切完再从磁盘回读标记确认。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findGameRoot } from './game-root.mjs';

/** @typedef {{ id: string, name: string, files: string[], marker: { file: string, key: string } }} Toggle */

/** @type {Map<string, (root: string) => Toggle[]>} */
const readers = new Map();

/**
 * 这个 checkout 的注册表读取器 —— 游戏服务端那份（server/mod/registry.js，框架装入）。注册表格式只有一处实现，
 * 本工具不自己解析；框架还没装（`--check` 跑在干净的游戏上）时返回空表，调用方会报「读不出开关」。
 * @param {string} root 游戏根目录
 * @returns {Promise<Toggle[]>}
 */
export async function listToggles(root) {
  if (!readers.has(root)) {
    let reader = () => [];
    try {
      const mod = await import(pathToFileURL(path.join(root, 'server', 'mod', 'registry.js')).href);
      if (typeof mod.readRegistryAt === 'function') reader = mod.readRegistryAt;
    } catch { /* 框架未装：由调用方报出 */ }
    readers.set(root, reader);
  }
  return readers.get(root)(root);
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
 * @returns {Promise<{ ok: true, id: string, on: boolean, changed: boolean } | { ok: false, detail: string }>}
 */
export async function setModState(root, { id, on }) {
  const list = await listToggles(root);
  if (!list.length) return { ok: false, detail: '读不出任何开关（mod/toggles.d/ 缺失，或本 MOD 还没安装）' };
  let toggle = null;
  if (id) toggle = list.find((t) => t.id === id) || null;
  else if (list.length === 1) [toggle] = list;
  if (!toggle) {
    return {
      ok: false,
      detail: id ? `注册表里没有开关 "${id}"（有：${list.map((t) => t.id).join(', ')}）`
        : `这个 checkout 有多个开关，请指明要切哪个：${list.map((t) => t.id).join(', ')}`,
    };
  }

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
  const flagValue = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
  /** 位置参数：不是 `--flag`、也不是某个 flag 的值。 */
  const flagValues = new Set([flagValue('game'), flagValue('toggle')].filter((v) => v !== undefined));
  const positional = argv.filter((a) => !a.startsWith('--') && !flagValues.has(a));
  const action = (positional[0] || 'status').toLowerCase();
  const id = positional[1] || flagValue('toggle');
  const root = findGameRoot(flagValue('game'));
  if (!root) { console.error('× 找不到游戏根目录（把游戏文件夹拖上来，或用 --game <路径> 指定）'); process.exit(1); }

  const usage = '× 用法：node tools/mod-toggle.mjs on|off|status [<id>] [--game <路径>]';

  if (action === 'status') {
    const list = await listToggles(root);
    if (!list.length) { console.error('× 读不出任何开关：mod/toggles.d/ 缺失，或本 MOD 还没安装'); process.exit(1); }
    for (const t of list) {
      const s = readModState(root, t);
      console.log(`  ${t.name || t.id} (${t.id}): ${s === null ? '读不出' : s ? '已开启 (ON)' : '已关闭 (OFF)'}`);
    }
    process.exit(0);
  }
  if (action !== 'on' && action !== 'off') { console.error(usage); process.exit(1); }

  const res = await setModState(root, { id, on: action === 'on' });
  if (!res.ok) { console.error(`× ${res.detail}`); process.exit(1); }
  console.log(res.changed ? `  ${res.id} → ${res.on ? 'ON' : 'OFF'}（请重新载入浏览器里的页面）` : `  ${res.id} 已经是 ${res.on ? 'ON' : 'OFF'}`);
}
