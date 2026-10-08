// server/mod/api.js — the HTTP side of the in-page 内容开关 (docs/MOD-RHODES.md §开关).
// (i18n-ignore-file: the API's messages are bilingual by design, 中文 · English — the same convention as the error
// pages of http/common.js and the routes of http/routes.js, which the badge shows as-is.)
//
// Two paths, dispatched by server/http/routes.js before its "any method but GET/HEAD → 405" rule (the switch is a
// POST):
//
//   GET  /mod/state                 → the state every client may read: one entry per registered toggle, whether THIS
//                                     request may switch (loopback), and how many matches are running
//   POST /mod/toggle?id=&on=0|1     → switch one toggle. Loopback only, refused while a match runs
//
// The logic lives here, not in routes.js, so the author's file carries only the lines that dispatch to it. Every
// answer is JSON (never the bilingual HTML error page of common.js sendError): these are API paths, and the only
// client is the badge, which wants a code it can branch on. It is *not* a public API — no CORS header is sent, so a
// browser on another origin cannot read the reply.
//
// The security decision is `isLoopback` (server/mod/toggle.js): the switch rewrites data/*.json, so it belongs to the
// machine running the server — a shared server's guests read the state and follow it, they never write it.

import { sendJson, setSecurityHeaders } from '../http/common.js';
import { applyToggle, isLoopback, REFUSE, status } from './toggle.js';

/** The paths this module answers (server/http/routes.js dispatches on them before its 405 rule). */
export const MOD_ROUTES = Object.freeze(new Set(['/mod/state', '/mod/toggle']));

/** How each refusal of applyToggle maps onto an HTTP status. */
const REFUSE_STATUS = Object.freeze({
  [REFUSE.UNKNOWN]: 404,
  [REFUSE.INVALID]: 400,
  [REFUSE.BUSY]: 409,
  [REFUSE.IO]: 500,
  [REFUSE.STALE]: 500,
});

/** A bilingual one-liner per refusal code, for the badge to show as-is. */
const REFUSE_TEXT = Object.freeze({
  [REFUSE.UNKNOWN]: '未知的开关 · unknown toggle',
  [REFUSE.INVALID]: '请求无效 · bad request',
  [REFUSE.BUSY]: '有对局正在进行，无法切换 · a match is running',
  [REFUSE.IO]: '切换失败：数据未能写入 · the data could not be written',
  [REFUSE.STALE]: '切换未生效 · the switch did not take effect',
});

/** A JSON body for every answer of this module. `Cache-Control: no-store` comes from sendJson. */
function reply(req, res, httpStatus, body) {
  setSecurityHeaders(res);
  sendJson(req, res, httpStatus, body);
}

/**
 * Answer a /mod/... request. Returns true when the path is ours (the caller then stops).
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} rawPath
 * @param {string} query
 * @param {{ lobby?: import('../lobby.js').Lobby, log?: object }} deps
 * @returns {boolean}
 */
export function handleModRoute(req, res, rawPath, query, { lobby = null, log = console } = {}) {
  if (!MOD_ROUTES.has(rawPath)) return false;
  const loopback = isLoopback(req);
  const matches = (() => { try { return Number(lobby?.stats?.().matches) || 0; } catch { return 0; } })();
  // Why the switch is closed, for the badge's tooltip: a running match first, then the address.
  const reason = matches > 0 ? 'matches' : loopback ? null : 'remote';
  /** The state as the Lobby sees it (its getData is the live holder — server/index.js). */
  const current = () => { try { return lobby?.safeData?.() ?? null; } catch { return null; } };

  if (rawPath === '/mod/state') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      reply(req, res, 405, { ok: false, code: 'METHOD', detail: 'Allow: GET, HEAD' });
      return true;
    }
    reply(req, res, 200, status(current(), { canToggle: loopback, matches, reason }));
    return true;
  }

  // /mod/toggle
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    reply(req, res, 405, { ok: false, code: 'METHOD', detail: 'Allow: POST' });
    return true;
  }
  if (!loopback) {
    reply(req, res, 403, {
      ok: false, code: 'REMOTE', detail: '只有运行服务器的本机可以切换 · the switch belongs to the machine running the server',
      from: String(req.socket?.remoteAddress || 'unknown'),
    });
    return true;
  }
  const params = new URLSearchParams(query);
  const id = params.get('id') || '';
  const onRaw = params.get('on');
  const on = onRaw === '1' || onRaw === 'true' ? true : onRaw === '0' || onRaw === 'false' ? false : null;
  if (on === null) {
    reply(req, res, 400, { ok: false, code: REFUSE.INVALID, detail: 'on must be 1/true or 0/false' });
    return true;
  }

  const result = applyToggle(id, on, { matches, log });
  if (!result.ok) {
    reply(req, res, REFUSE_STATUS[result.code] ?? 500, { ok: false, code: result.code, detail: result.detail, text: REFUSE_TEXT[result.code] });
    return true;
  }
  // Read the state back through the Lobby so the broadcast and the reply carry the NEW state, not the one this
  // request saw on the way in.
  const fresh = status(current(), { canToggle: true, matches, reason: null });
  // Tell every connected session at once (rooms and title screens alike): their /data/*.json are stale from now on.
  try { lobby?.modChanged?.(fresh); } catch (e) { log?.error?.('[mod] broadcast failed', e); }
  reply(req, res, 200, { ok: true, id: result.id ?? id, on: result.on, toggles: fresh.toggles });
  return true;
}
