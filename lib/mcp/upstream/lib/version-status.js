/** The vendored MCP engine updates with its owning DSH App package. */
export const INSTALLED_PLUGIN_VERSION = '0.2.63';

/** Return legacy version fields without querying or reinstalling the removed plugin. */
export function createVersionStatusService({ now = Date.now } = {}) {
  return {
    status() {
      return {
        integrated: true,
        engineVersion: INSTALLED_PLUGIN_VERSION,
        installedVersion: INSTALLED_PLUGIN_VERSION,
        latestVersion: null,
        updateAvailable: false,
        releasePending: false,
        checking: false,
        status: 'integrated',
        checkedAt: new Date(now()).toISOString(),
        updateOwner: 'dsh-app',
        errors: [],
      };
    },
    dispose() {},
  };
}
