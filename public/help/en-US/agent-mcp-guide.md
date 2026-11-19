# External Agent & MCP Integration Guide {#agent-mcp-guide-section-1}

Use the **External Agent Workbench** (`/mcp`) to connect Claude Code, Pi, Antigravity, or WebMCP-capable browser agents directly to Tsukuyomi so you can manage books and translate chapters with your existing agent quota.

## Transport Modes {#agent-mcp-guide-section-2}

### Desktop App: Local Streamable HTTP MCP Server {#agent-mcp-guide-section-3}

- Binds strictly to `127.0.0.1` (default port `48321`), disabled by default until you turn it on from `/mcp`.
- Enforces `Authorization: Bearer <token>`, loopback `Host`, and `Origin` checks against cross-site requests.
- Serves both the stateless `2026-07-28` MCP revision (`server/discover`) and the legacy `2025-03-26` handshake (`initialize`) on the same `POST /mcp` endpoint.
- Local port, Bearer token, toggles, and permission mode stay strictly on this device and are never uploaded to GitHub Gist or exported into backup files.

### Browser Build: WebMCP Bridge {#agent-mcp-guide-section-4}

- Opening `/mcp` in a browser detects `document.modelContext` (or legacy `navigator.modelContext`).
- Enabling WebMCP tool registration exposes all tools allowed by the active permission mode plus the read-only `get_workflow_guide` tool.
- If a site is blocked by browser CORS when calling `import_book_from_url`, have your agent fetch the text itself and call `create_book` followed by `add_chapters`.

## Permission Modes & Translation Versions {#agent-mcp-guide-section-5}

- **Read only (`read_only`)**: Read library, chapters, terms, characters, memories, and translation chunks only.
- **Translate & edit (`translate_and_edit`, default)**: Allows creating/importing books, adding chapters, submitting translations, and maintaining terms, characters, and memories; blocks deleting books.
- **Full control (`full`)**: Additionally unlocks `delete_book`.
- **Version retention**: Submissions default to `append` (adding and selecting a new version). Each paragraph retains up to 5 versions per target language; older versions are evicted beyond that limit, so avoid submitting repeated revisions to the same paragraph unnecessarily.

## Recommended Translation Workflow {#agent-mcp-guide-section-6}

1. Enable the transport on `/mcp` and copy the pre-filled configuration snippet for Claude Code, Pi, or Antigravity.
2. Invoke the `translate-chapter` or `import-and-translate` workflow prompt (for long web novels, `import_book_from_url` fetches up to 20 chapters per batch by default—adjust with `max_chapters` and re-call while `pending_chapter_count > 0`).
3. Saved translations appear live in the reader and display their external source label (such as `MCP · claude-opus-4`) in translation history.
