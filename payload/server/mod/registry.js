// server/mod/registry.js — 内容开关的注册表：这个 checkout 提供哪些 MOD，以及每个 MOD 拥有什么。
//
// 一个 MOD = 一片。`mod/toggles.d/<id>.json`（每个 MOD 一个文件），另外还读一份可选的旧式总表
// `mod/toggles.json`（0.1.x 装过的玩家树里还在；分片优先，同 id 只取第一条）。
// 于是「装 / 卸一个 MOD」就是增删一个文件 —— 两个 MOD 的文件集天然不相交，装第二个 MOD 永远不用改写第一个 MOD 的条目。
//
// 条目形状：
//   { id, name, englishName, description, files: [...], marker: { file, key }, client?: 'js/ui/<x>.js' }
//
//   * `files`  它拥有的 data/*.json —— 开关只写这几个文件，别的 MOD 的数据碰都不碰。
//   * `marker` 判在开 / 关的标记：`data/<file>.json` 里有没有 `<key>`。
//   * `client` 可选。开关打开时由框架（public/js/ui/modBadge.js）动态 import 的客户端模块，路径相对站点根
//              （例如 'js/ui/danmaku.js'）。模块要**自挂载**（导出一个 `mount()`），这样 main.js 不必认识任何一个 MOD。
//
// 本文件零依赖（只用 node 内置），所以服务端（server/mod/toggle.js）、玩家侧的开关 CLI（tools/mod-toggle.mjs）
// 与开发工具（tools/local-extract/build-mod-variants.mjs）共用同一份读取逻辑 —— 注册表格式只有一处实现。

import fs from 'node:fs';
import path from 'node:path';

/** 旧式总表的文件名（可选的，向后兼容）。 */
export const REGISTRY_FILE_NAME = 'toggles.json';
/** 分片目录名：一个 MOD 一片。 */
export const REGISTRY_DIR_NAME = 'toggles.d';

/**
 * 一个开关。
 * @typedef {{ id: string, name: string, englishName: string, description: string, files: string[],
 *   marker: { file: string, key: string }, client: string|null }} Toggle
 */

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
/** 客户端模块：相对站点根的 .js 路径（不许绝对 URL / 查询串 / 跳出站点）。 */
const CLIENT_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,127}\.js$/;

/**
 * 校验并归一化一条 registry 记录；不合格返回 null（`listToggles` 会把它丢掉，而不是让整张表失效）。
 * @param {any} raw
 * @returns {Toggle|null}
 */
function normalizeToggle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
  if (!Array.isArray(raw.files) || raw.files.length === 0) return null;
  if (!raw.files.every((f) => typeof f === 'string' && ID_RE.test(f))) return null;
  if (!raw.marker || typeof raw.marker.file !== 'string' || typeof raw.marker.key !== 'string') return null;
  if (!ID_RE.test(raw.marker.file)) return null;
  const client = typeof raw.client === 'string' && CLIENT_RE.test(raw.client) && !raw.client.includes('..')
    ? raw.client : null;
  return {
    id: raw.id,
    name: String(raw.name ?? raw.id),
    englishName: String(raw.englishName ?? raw.name ?? raw.id),
    description: String(raw.description ?? ''),
    files: raw.files.slice(),
    marker: { file: raw.marker.file, key: raw.marker.key },
    client,
  };
}

/** 一份 registry 文档里的条目：`{toggles:[…]}`、裸数组、或单条对象都认。 @param {any} doc */
function entriesOf(doc) {
  if (Array.isArray(doc)) return doc;
  if (doc && typeof doc === 'object') {
    if (Array.isArray(doc.toggles)) return doc.toggles;
    if (typeof doc.id === 'string') return [doc];
  }
  return [];
}

/** @param {string} file */
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * 读一份注册表。分片目录里的 `*.json` 按文件名排序先取，再用总表补齐它没提到的 id（同 id 只取第一条）。
 * 两条路径都可以缺（缺了就是没有那个 MOD），永远不抛。
 * @param {{ baseFile?: string|null, dir?: string|null }} [opts]
 * @returns {Toggle[]}
 */
export function readRegistry({ baseFile = null, dir = null } = {}) {
  /** @type {Toggle[]} */
  const out = [];
  const seen = new Set();
  /** @param {any} raw */
  const take = (raw) => {
    const t = normalizeToggle(raw);
    if (t && !seen.has(t.id)) { seen.add(t.id); out.push(t); }
  };

  let fragments = [];
  if (dir) {
    try { fragments = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort(); } catch { fragments = []; }
  }
  for (const f of fragments) for (const e of entriesOf(readJson(path.join(dir, f)))) take(e);
  if (baseFile) for (const e of entriesOf(readJson(baseFile))) take(e);
  return out;
}

/** 某个 checkout 根目录下注册表的两处位置。 @param {string} root */
export function registryPaths(root) {
  return {
    baseFile: path.join(root, 'mod', REGISTRY_FILE_NAME),
    dir: path.join(root, 'mod', REGISTRY_DIR_NAME),
  };
}

/** 直接从 checkout 根目录读。 @param {string} root @returns {Toggle[]} */
export function readRegistryAt(root) {
  const { baseFile, dir } = registryPaths(root);
  return readRegistry({ baseFile, dir });
}

/**
 * 一个开关对外可见的字段（/mod/state 用）。
 * `files` / `marker` 是服务端实现细节，不下发；`client` 要给 —— 客户端靠它动态 import 各 MOD 的模块。
 * @param {Toggle} t
 */
export function publicToggle(t) {
  return {
    id: t.id, name: t.name, englishName: t.englishName, description: t.description, client: t.client,
  };
}
