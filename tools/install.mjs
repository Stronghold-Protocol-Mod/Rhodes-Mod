// tools/install.mjs — 把「罗德岛 MOD」装进一份《卫戍协议：盟约》官方 0.2.3 里。
//
//   node tools/install.mjs                    自动找游戏目录，装好并把 mod 打开
//   node tools/install.mjs --game <路径>       指定游戏根目录
//   node tools/install.mjs --check            只检查，不写任何东西
//   node tools/install.mjs --off              装好但先不开（保持官方原样，随时可开）
//   node tools/install.mjs --restore          用最近一次备份把作者文件还原回去
//
// 它做三件事，顺序固定：
//   1. 覆盖安装 mod 自己的文件（payload/，全部是新增文件，不会动作者任何东西）
//      —— 其中一部分是**中立的开关框架**（server/mod/*、public/js/ui/modBadge.js、tools/mod-toggle.mjs …），
//         每一个 MOD 的包都带、且逐字节相同，所以两个 MOD 都有装时后装的那个只会「已是最新」地跳过；
//         另一部分才是本 MOD 自己的（数据快照、盟约与 kit、美术）。
//   2. 给作者文件打补丁（patches/，统一 diff；data/assets.json 走结构化合入）
//      —— 每一步都按 SHA-256 自校验：打完的结果必须与打包时一致，否则整步失败并报出是哪个文件。
//         框架占的那些补丁文件，两个 MOD 的包内容一致；本 MOD 只patch自己那几行，所以两家互不覆盖。
//   3. 把**本包这个** mod 打开（manifest 的 mod.id；data/ 从官方原样切到 ON 快照）。
//
// 作者文件在改之前会备份到 <游戏>/.rhodes-mod-backup/<时间戳>/。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { applyPatch } from './diff.mjs';
import { findGameRoot, gameVersion, GAME_PKG } from './game-root.mjs';
import { setModState, readModState, listToggles } from './mod-toggle.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
const CHECK = has('--check');
const RESTORE = has('--restore');
const KEEP_OFF = has('--off');
const FORCE = has('--force');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const sha1_12 = (v) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12);
const readOrNull = (p) => { try { return fs.readFileSync(p); } catch { return null; } };
const rel = (p) => p.split(path.sep).join('/');

let added = 0, patched = 0, skipped = 0;
const problems = [];
const log = (s) => console.log(s);

function header(t) { log(`\n${t}`); }

// ------------------------------------------------------------ 找游戏目录 -----

const root = findGameRoot(arg('game'));
if (!root) {
  console.error('× 找不到《卫戍协议：盟约》的游戏目录。');
  console.error('  把 mod 解压到游戏文件夹里再运行，或者显式指定：');
  console.error('    node tools/install.mjs --game "D:\\Games\\Stronghold-Protocol"');
  process.exit(2);
}
const version = gameVersion(root);
log(`游戏目录  ${root}`);
log(`官方版本  ${version || '(读不出)'}    mod 基准 ${MANIFEST.base.version}`);

if (!RESTORE) {
  const want = MANIFEST.base.version;
  if (version && version.split('.').slice(0, 2).join('.') !== want.split('.').slice(0, 2).join('.')) {
    log(`\n！ 这个 mod 是对着官方 ${want} 做的，你这份是 ${version}。`);
    if (!FORCE) {
      console.error('  先升级到官方 ' + want + '（脚本会再校验一遍补丁能不能落地），或加 --force 强行继续。');
      process.exit(3);
    }
    log('  已加 --force，继续（补丁若落不到正确结果会逐个报错）。');
  }
}

// --------------------------------------------------------------- 备份 ------

const BACKUP = path.join(root, '.rhodes-mod-backup');

if (RESTORE) {
  if (!fs.existsSync(BACKUP)) { console.error(`× 没有备份目录 ${rel(BACKUP)}`); process.exit(1); }
  const stamps = fs.readdirSync(BACKUP).filter((d) => fs.statSync(path.join(BACKUP, d)).isDirectory()).sort();
  if (!stamps.length) { console.error('× 备份目录是空的'); process.exit(1); }
  const src = path.join(BACKUP, stamps[stamps.length - 1]);
  let n = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { walk(abs); continue; }
      const to = path.join(root, path.relative(src, abs));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(abs, to);
      n += 1;
    }
  };
  walk(src);
  log(`\n已从备份 ${stamps[stamps.length - 1]} 还原 ${n} 个作者文件。`);
  log('（mod 新增的文件还在 —— 要彻底清干净就重新解压一份官方包。）');
  process.exit(0);
}

let backupDir = null;
function backup(abs) {
  if (CHECK || !fs.existsSync(abs)) return;
  backupDir ||= path.join(BACKUP, new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
  const to = path.join(backupDir, path.relative(root, abs));
  if (fs.existsSync(to)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(abs, to);
}

// --------------------------------------------------- 1. 覆盖 mod 自己的文件 -----

header('== 1/3  安装 mod 自己的文件 ==');
for (const [relPath, wantHash] of Object.entries(MANIFEST.files)) {
  const from = path.join(PKG, 'payload', relPath.split('/').join(path.sep));
  const to = path.join(root, relPath.split('/').join(path.sep));
  const want = fs.readFileSync(from);
  const cur = readOrNull(to);
  if (cur && sha256(cur) === wantHash) { skipped += 1; continue; }
  if (!CHECK) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, want); }
  if (!cur) added += 1; else added += 1;
  log(`  ${cur ? '更新' : '新增'}  ${relPath}`);
}
log(`  —— ${added} 个写入，${skipped} 个已是最新`);

// ------------------------------------------------------ 2. 给作者文件打补丁 -----

header('== 2/3  给作者文件打补丁 ==');
for (const [relPath, meta] of Object.entries(MANIFEST.patches)) {
  const abs = path.join(root, relPath.split('/').join(path.sep));
  const cur = readOrNull(abs);
  if (!cur) { problems.push(`${relPath}: 文件不存在`); log(`  × 缺失  ${relPath}`); continue; }
  const h = sha256(cur);
  if (h === meta.resultSha256) { skipped += 1; log(`  已打过  ${relPath}`); continue; }

  const patchText = fs.readFileSync(path.join(PKG, meta.patch), 'utf8');
  let text, drift = 0;
  try {
    ({ text, drift } = applyPatch(cur.toString('utf8'), patchText));
  } catch (e) {
    problems.push(`${relPath}: ${e.message}`);
    log(`  × 打不上  ${relPath} — ${e.message}`);
    continue;
  }
  const out = Buffer.from(text, 'utf8');
  if (sha256(out) !== meta.resultSha256) {
    problems.push(`${relPath}: 打完的结果与打包时不一致（你的文件不是官方 ${MANIFEST.base.version} 的原件）`);
    log(`  × 结果不符  ${relPath}`);
    continue;
  }
  if (!CHECK) { backup(abs); fs.writeFileSync(abs, out); }
  patched += 1;
  log(`  补丁  ${relPath}  ${meta.hunks} hunks${drift ? `（行位移 ${drift > 0 ? '+' : ''}${drift}）` : ''}`);
}

// data/assets.json —— 结构化合入（压成一行的 JSON，文本 diff 没意义）
for (const [relPath, meta] of Object.entries(MANIFEST.merge)) {
  const abs = path.join(root, relPath.split('/').join(path.sep));
  const merge = JSON.parse(fs.readFileSync(path.join(PKG, meta.file), 'utf8'));
  let doc;
  try { doc = JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (e) { problems.push(`${relPath}: ${e.message}`); log(`  × 读不出  ${relPath}`); continue; }

  const already = Object.entries(merge.setValues).every(([top, entries]) =>
    Object.entries(entries).every(([k, v]) => JSON.stringify(doc[top]?.[k]) === JSON.stringify(v)))
    && Object.entries(merge.remove).every(([top, keys]) => keys.every((k) => !(k in (doc[top] || {}))));
  if (already) { skipped += 1; log(`  已合过  ${relPath}`); continue; }

  if (doc.hash !== merge.requires.hash) {
    problems.push(`${relPath}: 头里的 hash 是 ${doc.hash}，期望 ${merge.requires.hash}（不是官方 ${MANIFEST.base.version} 的原文件）`);
    log(`  × 基准不符  ${relPath}`);
    continue;
  }
  for (const [top, entries] of Object.entries(merge.setValues)) doc[top] = { ...(doc[top] || {}), ...entries };
  for (const [top, keys] of Object.entries(merge.remove)) for (const k of keys) delete doc[top]?.[k];
  for (const [s, d] of Object.entries(merge.statsDelta)) doc.stats[s] = (doc.stats[s] || 0) + d;
  const { version: _v, hash: _h, generator: _g, stats: _s, ...body } = doc;
  doc.hash = sha1_12(body);

  // 官方文件是「压缩 JSON + 结尾换行」的写法（tools/fetch-assets.mjs writeJsonAtomic），照抄
  if (!CHECK) { backup(abs); fs.writeFileSync(abs, JSON.stringify(doc) + '\n'); }
  patched += 1;
  const n = Object.entries(merge.setValues).map(([k, v]) => `${k}+${Object.keys(v).length}`).join(' ');
  log(`  合入  ${relPath}  (${n})`);
}

// ---------------------------------------------------------------- 3. 开关 -----

header('== 3/3  mod 开关 ==');
// This package switches ITS OWN mod (manifest `mod.id`), never "the first toggle of the checkout": a player who also
// installed another mod must still get this one's switch flipped, whatever the registry order is.
const TOGGLE_ID = MANIFEST.mod && MANIFEST.mod.id;
const toggles = await listToggles(root);
const toggle = TOGGLE_ID ? toggles.find((t) => t.id === TOGGLE_ID) : null;
if (!toggle) {
  problems.push(`注册表里没有本 MOD 的开关 "${TOGGLE_ID}"（读出：${toggles.map((t) => t.id).join(', ') || '（无）'}）`);
  log(`  × 注册表里没有 "${TOGGLE_ID}"`);
} else {
  const state = readModState(root, toggle);
  if (CHECK) {
    log(`  ${toggle.name || toggle.id}: ${state === null ? '读不出' : state ? '已开启 (ON)' : '已关闭 (OFF)'}`);
  } else if (KEEP_OFF) {
    const r = await setModState(root, { id: toggle.id, on: false });
    log(r.ok ? `  ${toggle.name}: 已在 OFF（--off）` : `  × ${r.detail}`);
    if (!r.ok) problems.push(r.detail);
  } else {
    const r = await setModState(root, { id: toggle.id, on: true });
    log(r.ok ? `  ${toggle.name}: ${r.changed ? '已开启 (ON)' : '本来就是 ON'}` : `  × ${r.detail}`);
    if (!r.ok) problems.push(r.detail);
  }
}

// ------------------------------------------------------------- 收尾 --------

header('== 结果 ==');
if (problems.length) {
  log(`× 有 ${problems.length} 个问题，没有全部完成：`);
  for (const p of problems) log(`   · ${p}`);
  if (backupDir) log(`\n已改动的文件备份在 ${rel(backupDir)}，可用 node tools/install.mjs --restore 还原。`);
  process.exit(1);
}

if (CHECK) {
  log('✓ 检查通过：mod 文件、作者文件补丁、开关状态都与打包时一致。');
} else {
  log(`✓ 装好了：新增/更新 ${added}，打补丁 ${patched}，跳过 ${skipped}${backupDir ? `，备份在 ${rel(backupDir)}` : ''}。`);
  log('');
  log('下一步：');
  log('  1. 启动服务器（Windows 双击 scripts\\start-windows.bat，或 npm start）');
  log('  2. 打开 http://localhost:3000');
  log(`  3. 标题页右下角的徽标就是开关，点一下切换 ${(MANIFEST.mod && MANIFEST.mod.name) || '本 MOD'} 开/关`);
  log(`     终端里也可以用：npm run mod -- on ${TOGGLE_ID || '<id>'} / npm run mod -- off ${TOGGLE_ID || '<id>'}`);
  log('     （装了别的 MOD 也走同一个 CLI：npm run mod:status 看全部开关）');
}
