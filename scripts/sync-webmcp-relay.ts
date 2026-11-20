/**
 * 把 WebMCP 本地中继的浏览器端文件从 npm 包复制到 public/webmcp-relay/，随应用分发。
 * 升级 @mcp-b/webmcp-local-relay 之后运行：bun run sync:webmcp-relay
 *
 * embed.js 开头会加一行质量检查的忽略注释：它由页面在运行时以 <script> 注入，
 * 没有任何模块 import 它，不加的话会被当成没有用到的文件。除这一行外内容与包里的完全一致，
 * 由 src/__tests__/agent-mcp-webmcp-relay.test.ts 校验。
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** embed.js 第一行的忽略注释；测试按同样的内容校验 */
const RELAY_EMBED_HEADER = '// fallow-ignore-file unused-file\n';

const browserDir = resolve(
  import.meta.dirname,
  '../node_modules/@mcp-b/webmcp-local-relay/dist/browser',
);
const targetDir = resolve(import.meta.dirname, '../public/webmcp-relay');

writeFileSync(
  resolve(targetDir, 'embed.js'),
  RELAY_EMBED_HEADER + readFileSync(resolve(browserDir, 'embed.js'), 'utf8'),
);
copyFileSync(resolve(browserDir, 'widget.html'), resolve(targetDir, 'widget.html'));
console.log(`已从 ${browserDir} 同步 embed.js 与 widget.html`);
