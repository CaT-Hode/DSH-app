# Desktop Host ownership

DSH App mounts one Host plugin in the shared `web` profile. The repository-backed Windows carrier sets `DSH_LOCAL_DESKTOP_OWNER`; the standalone carrier sets `DSH_APP_OWNER`. Setting both is invalid.

The Windows carrier receives `dsh-shared-ready` and uses `desktop-link/web.json` with `/dsh-desktop/shutdown`. The standalone carrier receives `dsh-app-ready` and uses `dsh-app/web.json` with `/dsh-app/shutdown`. Each shutdown route requires the authenticated connection and its owner's header. Readiness includes the version read from the actual DSH CLI package.

Both carriers save their CLI, Node executable and working directory to `dsh-app/runtime.json`. The desktop package can reuse this installed runtime. Profile installations replacing the old `dsh-desktop-shared-host` must disable that row to avoid duplicate maintenance, accounting and HTTP registrations.

Verification uses an isolated Harness home for conversation creation, preset selection, model selection and archival, then exercises the repository-backed Electron startup and authenticated plugin endpoints.

The functional check also reads the running Loader inventory and rejects enabled entries whose root Fiber failed. Successful conversation APIs alone do not establish that optional plugins loaded. Authenticated diagnostics expose current entry phases and the last 30 redacted Host errors, independently of dependency compatibility declarations.
