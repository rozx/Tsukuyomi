# WebMCP 本地中继的浏览器端文件

这里的 `embed.js` 与 `widget.html` 原样复制自 npm 包 `@mcp-b/webmcp-local-relay`（MIT 许可）的
`dist/browser/` 目录，随应用分发，不从 CDN 加载。浏览器版开启 WebMCP 时由
`src/services/agent-mcp/webmcp-relay.ts` 注入 `embed.js`，它会在同目录取 `widget.html`。

**不要手工修改这两个文件。** 升级依赖后重新复制：

```bash
cp node_modules/@mcp-b/webmcp-local-relay/dist/browser/{embed.js,widget.html} public/webmcp-relay/
```

`src/__tests__/agent-mcp-webmcp-relay.test.ts` 会校验它们与已安装的包完全一致，
并且中继包与页面运行时 `@mcp-b/global` 的主版本相同。
