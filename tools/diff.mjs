// tools/diff.mjs — 最小可用的统一 diff 生成器 + 应用器（纯 JS，不依赖外部 diff/patch 程序）。
//
// 生成端用 Myers O(ND) 最短编辑距离；应用端按 hunk 匹配"删除+上下文"的前像，先在记录的偏移处找，
// 找不到就就近搜、再全文搜（容忍官方文件被无关改动挪了行）。找不到就报错退出，绝不猜。
//
// 这个文件同时被两个地方用：打包生成器（生成 patches/）和安装器（应用 patches/）。

// ------------------------------------------------------------------ 生成 -----

/**
 * 把两个 Uint8Array/字符串按行切分。返回 { lines, eol } —— 结尾有没有换行会被记住。
 * @param {Buffer|string} buf
 */
export function splitLines(buf) {
  const text = typeof buf === 'string' ? buf : buf.toString('utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const body = text.split(/\r\n|\n/);
  let trailing = false;
  if (body.length && body[body.length - 1] === '') { body.pop(); trailing = true; }
  return { lines: body, eol, trailing };
}

/**
 * Myers O(ND)：返回一个 ops 数组，每项 ['eq'|'del'|'ins', ai, bi]（ai/bi 为各自下标，ins 时 ai 为 null）。
 * @param {string[]} a @param {string[]} b
 */
function diffOps(a, b) {
  const N = a.length, M = b.length;
  if (N === 0 && M === 0) return [];
  const MAX = N + M;
  const off = MAX;
  const v = new Int32Array(2 * MAX + 2);
  /** @type {Int32Array[]} */
  const trace = [];
  let found = -1;

  for (let d = 0; d <= MAX; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1];
      else x = v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) { x += 1; y += 1; }
      v[off + k] = x;
      if (x >= N && y >= M) { found = d; break; }
    }
    if (found >= 0) break;
  }
  if (found < 0) throw new Error('diff: no edit path found');

  // 回溯（trace[d] 是处理第 d 层之前的状态）
  const ops = [];
  let x = N, y = M;
  for (let d = found; d > 0; d--) {
    const vd = trace[d];
    const k = x - y;
    let prevK;
    if (k === -d || (k !== d && vd[off + k - 1] < vd[off + k + 1])) prevK = k + 1;
    else prevK = k - 1;
    const prevX = vd[off + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x -= 1; y -= 1; ops.push(['eq', x, y]); }
    if (x === prevX) { y -= 1; ops.push(['ins', null, y]); }
    else { x -= 1; ops.push(['del', x, null]); }
  }
  while (x > 0 && y > 0) { x -= 1; y -= 1; ops.push(['eq', x, y]); }
  while (y > 0) { y -= 1; ops.push(['ins', null, y]); }
  while (x > 0) { x -= 1; ops.push(['del', x, null]); }
  ops.reverse();
  return ops;
}

/**
 * 生成统一 diff。返回 '' 表示两边一致。
 * @param {Buffer|string} baseBuf @param {Buffer|string} nextBuf
 * @param {{ labelA?: string, labelB?: string, context?: number }} [opts]
 */
export function unifiedDiff(baseBuf, nextBuf, { labelA = 'a', labelB = 'b', context = 3 } = {}) {
  const A = splitLines(baseBuf), B = splitLines(nextBuf);
  const a = A.lines, b = B.lines;
  const ops = diffOps(a, b);
  if (!ops.some((o) => o[0] !== 'eq')) return '';

  // 变化块（相邻的 del/ins 合成一块）
  const changes = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i][0] === 'eq') { i += 1; continue; }
    const start = i;
    while (i < ops.length && ops[i][0] !== 'eq') i += 1;
    changes.push([start, i - 1]);
  }

  // 按 context 扩成 hunk，并合并重叠的
  const hunks = [];
  let j = 0;
  while (j < changes.length) {
    let [s, e] = changes[j];
    let s2 = s, e2 = e;
    // 向前后吞掉 context 行（ops 里 eq 的项是成对推进的）
    let lead = 0, k = s - 1;
    while (k >= 0 && ops[k][0] === 'eq' && lead < context) { lead += 1; k -= 1; }
    let tail = 0, m = e + 1;
    while (m < ops.length && ops[m][0] === 'eq' && tail < context) { tail += 1; m += 1; }
    s2 = s - lead; e2 = e + tail;
    // 与下一个变化块重叠就继续吞
    while (j + 1 < changes.length && changes[j + 1][0] - 1 <= e2 + context) {
      j += 1;
      let t2 = changes[j][1];
      let tail2 = 0, mm = t2 + 1;
      while (mm < ops.length && ops[mm][0] === 'eq' && tail2 < context) { tail2 += 1; mm += 1; }
      e2 = t2 + tail2;
    }
    hunks.push([s2, e2]);
    j += 1;
  }

  const out = [`--- ${labelA}`, `+++ ${labelB}`];
  for (const [s, e] of hunks) {
    const slice = ops.slice(s, e + 1);
    let aStart = null, aCount = 0, bStart = null, bCount = 0;
    for (const [kind, ai, bi] of slice) {
      if (kind !== 'ins') { if (aStart === null) aStart = ai; aCount += 1; }
      if (kind !== 'del') { if (bStart === null) bStart = bi; bCount += 1; }
    }
    if (aStart === null) aStart = slice[0][1] ?? 0;
    if (bStart === null) bStart = slice[0][2] ?? 0;
    out.push(`@@ -${aCount === 0 ? aStart : aStart + 1},${aCount} +${bCount === 0 ? bStart : bStart + 1},${bCount} @@`);
    for (const [kind, ai, bi] of slice) {
      if (kind === 'eq') out.push(' ' + a[ai]);
      else if (kind === 'del') out.push('-' + a[ai]);
      else out.push('+' + b[bi]);
    }
  }
  return out.join('\n') + '\n';
}

// ------------------------------------------------------------------ 应用 -----

/**
 * 应用统一 diff。baseBuf 现在的内容，patchText 是 unifiedDiff 的产物。
 * 返回 { text, offset } —— offset 是相对"预期位置"的整体行位移（用来诊断版本漂移）。
 * @param {string} baseText @param {string} patchText
 */
export function applyPatch(baseText, patchText) {
  const src = baseText.split(/\r\n|\n/);
  const hadTrailing = src.length && src[src.length - 1] === '';
  if (hadTrailing) src.pop();

  const lines = patchText.split(/\r\n|\n/);
  let li = 0;
  // 每个 hunk 头里的行号都是相对"原始文件"的；前面的 hunk 已经插入/删除了若干行，
  // 所以定位时要补上累计位移，否则越靠后的 hunk 偏得越多。
  let delta = 0;
  let drift = 0;

  while (li < lines.length) {
    const head = lines[li];
    if (!head.startsWith('@@ ')) { li += 1; continue; }
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(head);
    if (!m) throw new Error(`bad hunk header: ${head}`);
    const aStart = Number(m[1]) - 1;
    li += 1;

    /** @type {string[]} */ const pre = [];   // 上下文 + 删除（原文件里必须连续出现）
    /** @type {string[]} */ const post = [];  // 上下文 + 新增
    const kinds = [];
    while (li < lines.length && !lines[li].startsWith('@@ ')) {
      const l = lines[li];
      if (l === '' && li === lines.length - 1) { li += 1; break; }
      const tag = l[0];
      const body = l.slice(1);
      if (tag === ' ') { pre.push(body); post.push(body); kinds.push('eq'); }
      else if (tag === '-') { pre.push(body); kinds.push('del'); }
      else if (tag === '+') { post.push(body); kinds.push('ins'); }
      else if (l === '\\ No newline at end of file') { /* ignore */ }
      else if (tag === '') { pre.push(body); post.push(body); kinds.push('eq'); }  // 空行上下文
      else throw new Error(`bad patch line: ${JSON.stringify(l)}`);
      li += 1;
    }

    // 找一个能放下 pre 的位置：先试预期位置，再就近 ±40，最后全文
    const hit = findPreimage(src, pre, aStart + delta);
    if (!hit) {
      throw new Error(`hunk @@ -${aStart + 1} @@ does not apply: context not found (first line: ${JSON.stringify(pre[0] ?? '')})`);
    }
    const at = hit.index;
    if (Math.abs(hit.drift) > Math.abs(drift)) drift = hit.drift;
    src.splice(at, pre.length, ...post);
    delta += post.length - pre.length;
  }

  return { text: src.join('\n') + (hadTrailing ? '\n' : ''), drift };
}

/** 在 src 里定位 pre 序列。先试 at，再就近，再全文。 */
function findPreimage(src, pre, at) {
  if (pre.length === 0) return { index: Math.min(at, src.length), drift: 0 };
  const eq = (i) => {
    if (i < 0 || i + pre.length > src.length) return false;
    for (let k = 0; k < pre.length; k += 1) if (src[i + k] !== pre[k]) return false;
    return true;
  };
  if (eq(at)) return { index: at, drift: 0 };
  for (let r = 1; r <= 40; r += 1) {
    if (eq(at + r)) return { index: at + r, drift: r };
    if (eq(at - r)) return { index: at - r, drift: -r };
  }
  for (let i = 0; i + pre.length <= src.length; i += 1) if (eq(i)) return { index: i, drift: i - at };
  return null;
}
