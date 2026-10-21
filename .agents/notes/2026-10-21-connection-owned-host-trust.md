# Connection-owned Host trust

DSH 0.2.1 removes the Web runtime service. DSH App, its MCP web routes and its sidebar now depend on `connection` and read `connection.trustedHosts`, which both supported core generations expose. The existing Host/Origin checks and authentication remain in place. Cordis fixtures mount these services without `webRuntime` and retain cross-site rejection and teardown checks.

Context insight loads its declared Zod dependency from DSH App and resolves Session and token-meter exports beside the real CLI file. A CLI junction and the absence of a direct Zod dependency in DSH no longer prevent Host activation. The integration regression exercises registration and disposal against the installed CLI.

Local artifact verification compares the requested file source with the profile dependency. An installed package from another archive cannot satisfy an operation solely because its version matches; the replacement archive must be installed first.

The 0.2.1 Web profile already mounts Schedule and its UI, so upgrading the installed profile removes the retired experimental schedule bundle selection without deleting task or conversation data. Candidate-core checks run in an isolated home before switching the desktop's managed runtime.
