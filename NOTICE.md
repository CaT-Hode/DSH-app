# Third-party material

The whale artwork in `desktop/DSH.svg`, `desktop/DSH.png`, and `desktop/DSH.ico` is derived from the DeepSeek Harness Web favicon in [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness), distributed under the MIT License.

Artwork copyright: Copyright (c) 2026 DeepSeek. The MIT permission and warranty notice included in [LICENSE](LICENSE) also applies to this artwork.

The compact desktop layout and action selection were informed by [MichengAI/dsh-codex-desktop](https://github.com/MichengAI/dsh-codex-desktop), distributed under Apache-2.0. DSH App does not ship that project's code or its bundled community plugins.

The maintenance coordinator's separation of process ownership, renderer operations and update state is informed by the official [DeepSeek Harness desktop](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/desktop). DSH App implements its own shared-Web adapter and is not an official DeepSeek desktop release.

The integrated MCP Host is derived from `dsh-mcp-connector@0.2.63`, Copyright (c) 2026 dsh-mcp-connector contributors, under MIT. Its license and pinned source hashes are retained in [lib/mcp/upstream/LICENSE](lib/mcp/upstream/LICENSE) and [lib/mcp/upstream/provenance.json](lib/mcp/upstream/provenance.json). DSH App supplies its own React MCP interface.

The integrated file, viewer, task and side-chat engine is derived from `dsh-better-sidebar@0.24.1`, Copyright (c) 2026 dsh-external, under MIT. Its license, source hashes and local changes are retained in [lib/sidebar/upstream/LICENSE](lib/sidebar/upstream/LICENSE) and [lib/sidebar/upstream/PROVENANCE.md](lib/sidebar/upstream/PROVENANCE.md). These runtimes belong to DSH App; neither predecessor package is required after migration.
