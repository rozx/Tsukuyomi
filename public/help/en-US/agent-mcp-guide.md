# External Agent & MCP Integration Guide {#agent-mcp-guide-section-1}

Use the **External Agent Workbench** (`/mcp`) to connect local agents such as Claude Code, Pi, or Antigravity directly to Tsukuyomi so you can manage books and translate chapters with your existing agent quota.

## Transport Modes {#agent-mcp-guide-section-2}

### Desktop App: Local Streamable HTTP MCP Server {#agent-mcp-guide-section-3}

- Binds strictly to `127.0.0.1` (default port `48321`), disabled by default until you turn it on from `/mcp`.
- Enforces `Authorization: Bearer <token>`, loopback `Host`, and `Origin` checks against cross-site requests.
- Serves both the stateless `2026-07-28` MCP revision (`server/discover`) and the legacy `2025-03-26` handshake (`initialize`) on the same `POST /mcp` endpoint.
- Local port, Bearer token, toggles, and permission mode stay strictly on this device and are never uploaded to GitHub Gist or exported into backup files.

### Browser Build: WebMCP Local Relay {#agent-mcp-guide-section-4}

- The browser build uses the **WebMCP local relay** (`@mcp-b/webmcp-local-relay`) so local agents such as Claude Code or Cursor can use the tools on this page. No experimental browser flag is needed.
- Turning on WebMCP in the first step of the page registers the tools allowed by the active permission mode (plus the read-only `get_workflow_guide`) and connects to the relay running on your computer.
- Add the relay to your agent client: for Claude Code run `claude mcp add webmcp-local-relay -- npx -y @mcp-b/webmcp-local-relay@latest --widget-origin <this page's address>`; for other clients merge the JSON shown on the page into the MCP configuration. Node.js 22 or later is required. The configuration shown on the page already contains this page's address, and the relay only accepts connections from it.
- Ask the agent to call `webmcp_list_sources`; seeing this page there means it is connected. If the page's tools are missing from the agent's tool list, list them with `webmcp_list_tools` and call them by name with `webmcp_call_tool`.
- Keep the page open while you work: the tools come from this tab, and the agent temporarily loses them when it is closed or reloaded.
- Keep only one Tsukuyomi tab open: with several open, the tool names the agent sees get a per-tab suffix.
- The address in the configuration shown on the page is the address you opened the page with; if you access it at a different address (for example `127.0.0.1` instead of `localhost`, or another domain), copy the configuration again.
- If the browser has an old WebMCP experimental flag turned on, the app automatically switches to its built-in implementation on this page; in the rare case it cannot, the page asks you to turn the flag off at `chrome://flags/#enable-webmcp-testing`.
- The page must be opened over HTTPS or localhost; otherwise WebMCP cannot be turned on.
- If a site is blocked by browser CORS when calling `import_book_from_url`, have your agent fetch the text itself and call `create_book` followed by `add_chapters`.

## Permission Modes & Translation Versions {#agent-mcp-guide-section-5}

- **Read only (`read_only`)**: Read library, chapters, terms, characters, memories, and translation chunks only.
- **Translate and edit (`translate_and_edit`, default)**: Allows creating/importing books, adding chapters, checking for and importing book updates, submitting translations, and maintaining terms, characters, and memories; blocks deleting books.
- **Full control (`full`)**: Additionally unlocks `delete_book`; the page asks for confirmation before switching to it.
- **Version retention**: Submissions default to `append` (adding and selecting a new version). Each paragraph retains up to 5 versions per target language; older versions are evicted beyond that limit, so avoid submitting repeated revisions to the same paragraph unnecessarily.

## Recommended Translation Workflow {#agent-mcp-guide-section-6}

1. On `/mcp` there are only two steps: turn on the server, then copy the quick start guide and paste it to your agent.
2. The "First-time setup" section at the top of the guide has the agent prepare everything for you: it asks where to put the project and creates the folder, configures this MCP inside it, and saves the guide there as AGENTS.md (plus a CLAUDE.md that references it for Claude Code). After that, starting the agent in that folder is enough and you do not need to paste the guide again. The rest of the guide covers the data model, every tool, step-by-step workflows, rules and error handling. In the desktop app the guide contains the access token, so do not commit that folder to a public repository. To add the MCP to your client yourself, expand "Add the MCP manually" on the page.
3. For long web novels, `import_book_from_url` fetches up to 20 chapters per batch by default; adjust with `max_chapters` and call it again while `pending_chapter_count > 0`.
4. For ongoing serials, `check_book_updates` checks the source site for new chapters and `apply_book_updates` imports them. Only new chapters are imported by default; applying text changes to imported chapters (`include_updated`) clears the translations of revised paragraphs.
5. Saved translations appear live in the reader, "Call activity" on the page shows every tool call in real time, and translation history displays the external source label (such as `MCP · claude-opus-4`).
