/**
 * 外部 Agent 客户端接入配置的生成：页面上的可复制片段与快速上手指南共用，
 * 保证两处给出的命令完全一致。
 */

/** 桌面端本地 MCP 服务在客户端里的服务名 */
const DESKTOP_MCP_SERVER_NAME = 'tsukuyomi';
/** 浏览器端经本地中继接入时的服务名与 npm 包 */
const RELAY_MCP_SERVER_NAME = 'webmcp-local-relay';
const RELAY_PACKAGE = '@mcp-b/webmcp-local-relay@latest';

/** 没有令牌时片段里显示的占位 */
export const TOKEN_PLACEHOLDER = '<YOUR_BEARER_TOKEN>';

export interface ClaudeCommandOptions {
  /**
   * 写入项目级配置（所在文件夹的 .mcp.json），而不是 Claude Code 默认的本机作用域。
   * 快速上手指南让 Agent 在为用户建立的项目文件夹里使用它。
   */
  projectScope?: boolean;
}

function scopeFlag(options?: ClaudeCommandOptions): string {
  return options?.projectScope ? '--scope project ' : '';
}

/** Claude Code：直连桌面端本地 MCP 服务 */
export function buildDesktopClaudeCommand(
  endpointUrl: string,
  token: string,
  options?: ClaudeCommandOptions,
): string {
  return [
    `claude mcp add ${scopeFlag(options)}--transport http ${DESKTOP_MCP_SERVER_NAME} ${endpointUrl} \\`,
    `  --header "Authorization: Bearer ${token || TOKEN_PLACEHOLDER}"`,
  ].join('\n');
}

/**
 * 启动本地中继的参数。中继默认接受任何网站接入，这里一律限定为指定页面来源，
 * 避免其他网站借它向 Agent 暴露工具。
 */
function relayArgs(pageOrigin: string): string[] {
  return ['-y', RELAY_PACKAGE, '--widget-origin', pageOrigin];
}

/** Claude Code：添加 WebMCP 本地中继（分行书写，避免长命令在页面上被截断） */
export function buildRelayClaudeCommand(
  pageOrigin: string,
  options?: ClaudeCommandOptions,
): string {
  return [
    `claude mcp add ${scopeFlag(options)}${RELAY_MCP_SERVER_NAME} -- \\`,
    `  npx -y ${RELAY_PACKAGE} \\`,
    `  --widget-origin ${pageOrigin}`,
  ].join('\n');
}

/** 其他客户端通用的 mcpServers JSON：添加 WebMCP 本地中继 */
export function buildRelayJsonConfig(pageOrigin: string): string {
  return JSON.stringify(
    { mcpServers: { [RELAY_MCP_SERVER_NAME]: { command: 'npx', args: relayArgs(pageOrigin) } } },
    null,
    2,
  );
}
