/** Install the owned MCP engine without competing with an enabled legacy owner. */
import * as upstream from './upstream/lib/index.js';
import { isTrustedWebRequest } from './upstream/lib/web.js';

export const Config = upstream.Config;
export const inject = [...upstream.inject];

/** Detect a configured legacy owner before opening or mutating its storage domain. */
export async function legacyMcpOwner(ctx) {
  const inventory = ctx.get?.('pluginInventory');
  if (!inventory) throw new Error('MCP integration requires the DSH plugin inventory');
  const snapshot = await inventory.list();
  return snapshot.entries.some(row => row.moduleName === 'dsh-mcp-connector' && row.enabled);
}

function mountOwnershipNotice(ctx) {
  for (const path of ['/dsh-app/mcp/api', '/dsh-app/mcp/events']) ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, handler(request, response) {
    const rejection = ctx.connection.requestRejection(request);
    if (rejection !== undefined) { response.writeHead(rejection); response.end(); return; }
    if (!isTrustedWebRequest(request, ctx.webRuntime.trustedHosts)) { response.writeHead(403); response.end(); return; }
    response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: false, message: '旧 MCP Connector 仍处于启用状态。停用或卸载旧插件并重启后，DSH App 将接管原有数据。', legacyOwner: true }));
  } }));
}

/** Mount validated Host services as a Cordis child, preserving effects and async teardown. */
export async function installMcp(ctx, { mcp = {} } = {}) {
  if (await legacyMcpOwner(ctx)) {
    ctx.inject(['webServer', 'webRuntime', 'connection'], mountOwnershipNotice);
    return { integrated: false, legacyOwner: true };
  }
  let services;
  const plugin = { ...upstream, async apply(child, config) { services = await upstream.apply(child, config); } };
  const fiber = ctx.plugin(plugin, mcp);
  await fiber.await();
  return { integrated: true, fiber, ...services };
}
