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

Modified source files include a notice describing the changes. No other upstream extensions, skills, or themes are included.
