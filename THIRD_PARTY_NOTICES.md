# Third-party notices

## mitsuhiko/agent-stuff

- Upstream: https://github.com/mitsuhiko/agent-stuff
- Author: Armin Ronacher and upstream contributors
- Source commit: `0865c849befd2021490679f96a8dee58c84ac857`
- License: Apache License 2.0; the upstream license text is included in [LICENSES/agent-stuff-Apache-2.0.txt](LICENSES/agent-stuff-Apache-2.0.txt).

The following files were imported:

| File | Local changes |
| --- | --- |
| `commands/discuss.md` | None. |
| `extensions/btw.ts` | Add current Pi ResourceLoader methods; seed the in-memory SessionManager rather than mutating transient agent state; use the parent model registry for streaming; pass the current working directory explicitly; finish custom overlays through their completion callback; guard TUI-only rendering and clamp rendered width. |
| `extensions/todos.ts` | Use a protocol-safe text fallback outside TUI mode; remove trailing whitespace. |
| `extensions/answer.ts` | Route extraction through the host model registry; guard terminal-only UI; propagate editor focus for IME support; constrain rendering at narrow widths. |
| `extensions/goal.ts` | None. |
| `extensions/review.ts` | Guard terminal-only review UI and widgets in RPC and non-interactive modes. |
| `extensions/files.ts` | Guard terminal-only UI; use a platform-aware reveal label; preserve final newlines when editing; correct NUL-delimited Git rename/copy path handling; remove the stale `/diff` alias comment. |

Modified source files include a notice describing the changes. Only the files listed above are imported; no other upstream extensions, skills, or themes are included.
