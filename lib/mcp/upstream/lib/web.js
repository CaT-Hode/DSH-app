/** Authenticated DSH App MCP endpoints and legacy protocol aliases; no legacy UI. */
import { readFile } from 'node:fs/promises';

export const API_METHODS = new Map([
  ['versionStatus', (api, p) => api.versionStatus(p?.force === true)],
  ['governance', api => api.governance()],
  ['previewPolicy', (api, p) => api.previewPolicy(p ?? {})],
  ['applyPolicy', (api, p) => api.applyPolicy(p ?? {})],
  ['rollbackPolicy', (api, p) => api.rollbackPolicy(p?.rollbackRevision, p?.expectedRevision)],
  ['scopeContext', (api, p) => api.scopeContext(p?.workspaceId)],
  ['previewConnectionScope', (api, p) => api.previewConnectionScope(p ?? {})],
  ['applyConnectionScope', (api, p) => api.applyConnectionScope(p ?? {})],
  ['previewConnectionScopeRollback', (api, p) => api.previewConnectionScopeRollback(p?.rollbackRevision)],
  ['rollbackConnectionScope', (api, p) => api.rollbackConnectionScope(p?.rollbackRevision, p?.expectedRevision)],
  ['catalog', (api, p) => api.catalog(p ?? {})],
  ['status', (api, p) => api.status(p ?? {})],
  ['healthCheck', (api, p) => api.healthCheck(p?.connectorId, p?.workspaceId, p?.connectionKey)],
  ['migrationPreview', (api, p) => api.migrationPreview(p ?? {})],
  ['migrateLegacy', (api, p) => api.migrateLegacy(p?.candidateIds ?? [])],
  ['connect', (api, p) => api.connect(p?.connectorId, p?.serverKey, undefined, p ?? {})],
  ['configure', (api, p) => api.configure(p ?? {})],
  ['importJson', (api, p) => api.importJson(p?.json, p ?? {})],
  ['exportConfig', api => api.exportConfig()],
  ['listSnapshots', api => api.listSnapshots()],
  ['createSnapshot', (api, p) => api.createSnapshot(p?.label)],
  ['previewSnapshot', (api, p) => api.previewSnapshot(p?.snapshotId)],
  ['restoreSnapshot', (api, p) => api.restoreSnapshot(p?.snapshotId)],
  ['installFromUrl', (api, p) => api.installFromUrl(p?.url, p ?? {})],
  ['renameConnection', (api, p) => api.renameConnection(p?.key, p?.name)],
  ['editableConnectionConfig', (api, p) => api.editableConnectionConfig(p?.key)],
  ['reconfigureConnection', (api, p) => api.reconfigureConnection(p?.key, p?.json)],
  ['disconnect', (api, p) => api.disconnect(p?.key)],
  ['setEnabled', (api, p) => api.setEnabled(p?.key, p?.enabled !== false)],
  ['refreshCatalog', api => api.refreshCatalog()],
  ['publish', (api, p) => api.publish(p?.connectorId, p?.published)],
  ['toolsList', (api, p) => api.toolsList(p?.connectorId, p?.workspaceId, p?.cachedOnly === true, p?.connectionKey)],
  ['toolSearch', (api, p) => api.toolSearch(p ?? {})],
  ['toolExplorer', (api, p) => api.toolExplorer(p ?? {})],
  ['toolExplorerDetail', (api, p) => api.toolExplorerDetail(p ?? {})],
  ['toolExplorerAction', (api, p) => api.toolExplorerAction(p ?? {})],
  ['toolDetail', (api, p) => api.toolDetail(p ?? {})],
]);

/** The DSH connection authenticates requests; browser mutations additionally require the current origin. */
export function isTrustedWebRequest(request, trustedHosts = []) {
  if (request.headers?.['sec-fetch-site'] === 'cross-site') return false;
  const host = request.headers?.host;
  if (typeof host !== 'string') return false;
  let authority;
  try { authority = new URL(`http://${host}`); } catch { return false; }
  if (authority.host !== host || authority.username || authority.password || authority.pathname !== '/') return false;
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(authority.hostname) || authority.hostname.endsWith('.localhost');
  if (!loopback && !trustedHosts.includes(authority.host)) return false;
  const origin = request.headers?.origin;
  if (origin === undefined) return request.method !== 'POST';
  if (typeof origin !== 'string') return false;
  try {
    const value = new URL(origin);
    return ['http:', 'https:'].includes(value.protocol) && value.host === host && !value.username && !value.password;
  } catch { return false; }
}

function writeJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-length': Buffer.byteLength(body) });
  response.end(body);
}

async function readBody(request) {
  const parts = []; let size = 0;
  for await (const part of request) {
    size += part.length;
    if (size > 1024 * 1024) throw new Error('请求体不能超过 1 MiB');
    parts.push(part);
  }
  const value = JSON.parse(Buffer.concat(parts).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid MCP request');
  if (value.params !== undefined && (!value.params || typeof value.params !== 'object' || Array.isArray(value.params))) throw new Error('Invalid MCP parameters');
  return value;
}

/** Register exact API/SSE routes, bounded catalog assets and return their disposer. */
export function mountWebRoutes(ctx, api, { eventHub } = {}) {
  const disposers = [];
  let disposed = false;
  const register = (path, method, run) => disposers.push(ctx.webServer.register({ kind: 'exact', path, async handler(request, response) {
    const rejection = ctx.connection.requestRejection(request);
    if (rejection !== undefined) { response.writeHead(rejection); response.end(); return; }
    if (!isTrustedWebRequest(request, ctx.webRuntime.trustedHosts)) { writeJson(response, 403, { ok: false, message: 'forbidden' }); return; }
    if (request.method !== method && !(method === 'GET' && request.method === 'HEAD')) { response.writeHead(405, { allow: method }); response.end(); return; }
    try { await run(request, response); }
    catch (error) { if (!response.destroyed && !response.headersSent) writeJson(response, 400, { ok: false, message: error instanceof Error ? error.message : 'MCP request failed' }); }
  } }));
  for (const path of ['/dsh-app/mcp/api', '/mcp-connector/api']) register(path, 'POST', async (request, response) => {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) { writeJson(response, 415, { ok: false, message: 'Expected application/json' }); return; }
    const body = await readBody(request), dispatch = API_METHODS.get(body.method);
    if (!dispatch) { writeJson(response, 400, { ok: false, message: 'Unknown MCP method' }); return; }
    const result = await dispatch(api, body.params ?? {});
    if (!response.destroyed) writeJson(response, 200, { ok: true, ...result });
  });
  for (const path of ['/dsh-app/mcp/events', '/mcp-connector/events']) register(path, 'GET', (request, response) => {
    if (request.method === 'HEAD') { response.writeHead(405, { allow: 'GET' }); response.end(); return; }
    if (!eventHub || !eventHub.subscribe(request, response)) writeJson(response, 503, { ok: false, message: 'Status events unavailable' });
  });
  for (const name of ['qcc-logo.svg', 'pkulaw-logo.png', 'wind-logo.png']) {
    for (const prefix of ['/dsh-app/mcp/assets/', '/mcp-connector/ui/assets/']) register(prefix + name, 'GET', async (request, response) => {
      const body = await readFile(new URL(`../assets/${name}`, import.meta.url));
      response.writeHead(200, { 'content-type': name.endsWith('.svg') ? 'image/svg+xml' : 'image/png', 'content-length': body.length, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" });
      response.end(request.method === 'HEAD' ? undefined : body);
    });
  }
  return () => { if (disposed) return; disposed = true; for (const dispose of disposers.reverse()) dispose(); };
}
