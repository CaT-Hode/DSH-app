# Focused development checks

The cost and context tests use Node directly. The client test evaluates the built browser factory against React DOM, jsdom and the SlotCore from a separately installed DSH runtime. It also reads the published SettingsRoot and MCP MarketOverlay components. Session RPC, HTTP balance/update responses and workspace navigation use isolated test services.

Install test dependencies without downloading Electron or another DSH runtime:

```powershell
npm install --ignore-scripts --omit=optional --legacy-peer-deps
```

Point the client check at an installed DSH 0.2.0-rc.2 runtime directory containing `node_modules/@deepseek-ai/dsh-client-ui-slots` and `dsh-client-ui-renderer`:

```powershell
$env:DSH_APP_TEST_CORE_ROOT = 'C:\path\to\dsh-runtime'
$env:DSH_APP_TEST_MCP_CLIENT = 'C:\path\to\web\node_modules\dsh-mcp-connector\lib\client.js'
npm run build
npm test
node --test tests/context-insight.spec.mjs
npm run test:client
```

The check covers slot installation and disposal, official navigation delegation, Host search calls and cancellation, published settings/MCP rendering in the main pane without modal isolation, section switching, MCP iframe prompt callbacks and origin validation, shared stores, original component/launcher restoration, balance and token presentation, and context-tab rendering. It executes the published SlotOutlet renderer for already-mounted MCP decoration and restoration, verifies that external store closure preserves a later panel selection, and checks that Escape closes search while retaining MCP. It also inspects the installed runtime's actual standard-kit factory. It does not send model messages or replace native-window acceptance. The MCP presentation is checked against version 0.2.63; its client path defaults to the current user's DSH Web profile and can be overridden above.

An existing DSH source checkout can supply test dependencies without reinstalling them. These overrides are optional; a normal development install uses this repository's dev dependencies:

```powershell
$env:DSH_APP_TEST_DEPENDENCY_ROOT = 'D:\deepseek-harness'
$env:DSH_APP_TEST_REACT_ROOT = 'D:\deepseek-harness\node_modules\.pnpm\react-dom@18.3.1_react@18.3.1\node_modules\react-dom'
$env:DSH_APP_TEST_CORE_ROOT = 'C:\Users\cth\.dsh\desktop-link\core-runtimes\0.2.0-rc.2'
$env:DSH_APP_TEST_MCP_CLIENT = 'C:\Users\cth\.dsh\profiles\web\node_modules\dsh-mcp-connector\lib\client.js'
npm run test:client
```

The React override names the package directory whose `package.json` resolves React and React DOM. The dependency override names the directory whose `package.json` resolves jsdom. Client roots, timers, pending requests and global DOM bindings are cleaned up after failed assertions as well as successful checks.
