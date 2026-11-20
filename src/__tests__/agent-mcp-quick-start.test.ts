import { describe, expect, it } from 'vitest';
import { ALL_AGENT_MCP_TOOLS } from 'src/services/agent-mcp';
import { buildAgentQuickStartGuide } from 'src/services/agent-mcp/agent-quick-start';

const DESKTOP = {
  kind: 'desktop' as const,
  endpointUrl: 'http://127.0.0.1:48321/mcp',
  token: 'tok-abc123',
};
const WEB = { kind: 'relay' as const, pageOrigin: 'https://app.example' };

const desktopGuide = (locale: 'zh-CN' | 'zh-TW' | 'en-US' = 'zh-CN') =>
  buildAgentQuickStartGuide({ locale, channel: 'desktop-mcp', connection: DESKTOP });
const webGuide = (locale: 'zh-CN' | 'zh-TW' | 'en-US' = 'zh-CN') =>
  buildAgentQuickStartGuide({ locale, channel: 'webmcp', connection: WEB });

describe('buildAgentQuickStartGuide', () => {
  it('是一份快速上手指南，开头让 Agent 替用户完成首次设置：建项目文件夹、配置 MCP、把指南存为 AGENTS.md', () => {
    const guide = desktopGuide();
    expect(guide).toMatch(/^# Tsukuyomi 快速上手指南/);
    // 首次设置是第一节，且是给 Agent 执行的编号步骤
    const setup = guide.slice(guide.indexOf('## 首次设置'), guide.indexOf('## 数据模型'));
    expect(setup).toMatch(/^1\. .*项目文件夹/m);
    expect(setup).toMatch(/^2\. .*MCP/m);
    expect(setup).toMatch(/^3\. .*AGENTS\.md/m);
    expect(setup).toMatch(/^4\. /m);
    // 询问用户放在哪里，并给出默认位置
    expect(setup).toMatch(/询问|问用户/);
    // 存好之后用户不用每次再粘贴
    expect(setup).toMatch(/不(用|需要)再粘贴/);
    // Claude Code 读取 CLAUDE.md；已有文件时追加而不是覆盖
    expect(setup).toContain('CLAUDE.md');
    expect(setup).toMatch(/追加/);
    // 已经设置过就跳过
    expect(setup).toMatch(/跳过/);
    expect(guide.indexOf('## 首次设置')).toBeLessThan(guide.indexOf('get_app_context'));
  });

  it('桌面通道的首次设置把 MCP 配置在项目文件夹里，并提醒令牌不要进公开仓库', () => {
    const guide = desktopGuide();
    expect(guide).toContain(
      'claude mcp add --scope project --transport http tsukuyomi http://127.0.0.1:48321/mcp',
    );
    expect(guide).toContain('Authorization: Bearer tok-abc123');
    // 列表项里的代码块每一行都缩进，Markdown 才能把它归在该步骤下
    expect(guide).toMatch(/^ {3}```bash\n {3}claude mcp add .*\n {5}--header .*\n {3}```$/m);
    expect(guide).toMatch(/开启本地 MCP 服务/);
    expect(guide).toMatch(/重启|重新加载/);
    expect(guide).toMatch(/令牌.*(公开|提交)/);
    expect(guide).not.toContain('webmcp-local-relay');
    expect(guide).toContain('prompts/get');
  });

  it('浏览器通道的首次设置添加本地中继并限定为本页来源，说明中继的管理工具', () => {
    const guide = webGuide();
    expect(guide).toContain('claude mcp add --scope project webmcp-local-relay');
    expect(guide).toContain('npx -y @mcp-b/webmcp-local-relay@latest');
    expect(guide).toContain('--widget-origin https://app.example');
    expect(guide).toContain('"mcpServers"');
    expect(guide).toMatch(/保持.*打开/);
    for (const tool of ['webmcp_list_sources', 'webmcp_list_tools', 'webmcp_call_tool'])
      expect(guide).toContain(tool);
    // 多个标签页同时连接时工具名会带后缀
    expect(guide).toMatch(/后缀/);
    expect(guide).toContain('get_workflow_guide');
    expect(guide).not.toContain('prompts/get');
    // 中继配置里没有令牌，不需要令牌提醒
    expect(guide).not.toMatch(/令牌/);
  });

  it('工具一览列出该通道的全部工具及说明，并标出会写入的工具', () => {
    const desktop = desktopGuide();
    const web = webGuide();
    for (const tool of ALL_AGENT_MCP_TOOLS) {
      if (tool.webMcpOnly) {
        expect(web).toContain(`\`${tool.name}\``);
        expect(desktop).not.toContain(`\`${tool.name}\``);
      } else {
        expect(desktop).toContain(`\`${tool.name}\``);
        expect(web).toContain(`\`${tool.name}\``);
      }
    }
    // 工具一览中每一行的工具名都是真实注册的工具
    const known = new Set(ALL_AGENT_MCP_TOOLS.map((tool) => tool.name));
    const listed = [...desktop.matchAll(/^- `([a-z_]+)`/gm)].map((match) => match[1]!);
    expect(listed.length).toBe(ALL_AGENT_MCP_TOOLS.filter((tool) => !tool.webMcpOnly).length);
    for (const name of listed) expect(known.has(name), `${name} 不是已注册的工具`).toBe(true);
    // 写入类与危险类工具有标注
    expect(desktop).toMatch(/- `submit_translations`（写入）/);
    expect(desktop).toMatch(/- `delete_book`（危险）/);
    expect(desktop).toMatch(/- `list_books`：/);
  });

  it('包含数据模型、分步骤的工作流与出错处理，细到参数与返回字段', () => {
    const guide = desktopGuide();
    // 数据模型
    expect(guide).toMatch(/最多保留 5 个版本/);
    // 翻译工作流的关键参数与返回字段
    for (const field of [
      'paragraph_id',
      'translated_text',
      'original_text_prefix',
      'chapter_title_translation',
      'context_before',
      'matched_terms',
      'failed_items',
      'remaining_untranslated_count',
    ])
      expect(guide).toContain(field);
    // 润色、导入、更新
    expect(guide).toContain('"overwrite"');
    expect(guide).toContain('has_more');
    expect(guide).toContain('IMPORT_IN_PROGRESS');
    expect(guide).toContain('include_updated');
    // 出错处理
    for (const code of ['PERMISSION_DENIED', 'NOT_READY', 'BOOK_ID_REQUIRED'])
      expect(guide).toContain(code);
    // 步骤带编号
    expect(guide).toMatch(/^1\. .+\n2\. .+\n3\. /m);
  });

  it('说明如何了解用户正在看什么、如何回答使用问题，以及统一修改译名的步骤', () => {
    const guide = desktopGuide();
    // 用户说「这一段」「这里」时先读上下文
    expect(guide).toMatch(/get_app_context[^\n]*页面[^\n]*选中/);
    expect(guide).toContain('selected_text');
    // 使用问题先查帮助文档
    expect(guide).toMatch(/怎么用[^\n]*search_help_docs[^\n]*get_help_doc/);
    // 统一译名：先统计、预览，再替换
    for (const field of [
      'search_paragraphs',
      'count_occurrences',
      'replace_in_translations',
      'dry_run',
      'original_contains',
    ])
      expect(guide).toContain(field);
    // 删除前要先向用户确认
    expect(guide).toMatch(/delete_terms[^\n]*确认/);
  });

  it('说明长篇如何省着读、新章节如何衔接上一章、翻译规范应写进特殊指令', () => {
    const guide = desktopGuide();
    for (const field of [
      'recent_chapters',
      'compact',
      'previous_chapter_tail',
      'recent_chapter_titles',
      'possible_terms',
      'text_in_source',
      'applied_chapters',
    ])
      expect(guide).toContain(field);
    // 模糊搜索是可选项
    expect(guide).toMatch(/默认都是精确匹配[^\n]*fuzzy: true/);
    // 每章都要遵守的规范放特殊指令，而不是记忆
    expect(guide).toMatch(/翻译规范[^\n]*update_special_instructions/);
  });

  it('浏览器通道说明来源数为 0 时怎么排查', () => {
    const guide = webGuide();
    expect(guide).toMatch(/0 个来源/);
    expect(guide).toContain('--widget-origin');
  });

  it('是通用说明而不是具体任务：不包含书名或待填占位', () => {
    const guide = desktopGuide();
    expect(guide).not.toContain('《');
    expect(guide).not.toMatch(/<[^>]*(URL|填)/);
  });

  it('按界面语言输出，三种语言结构一致并保留工具名原文', () => {
    const sections = (text: string) => ({
      h2: text.match(/^## /gm)?.length,
      h3: text.match(/^### /gm)?.length,
    });
    const reference = sections(desktopGuide('zh-CN'));
    expect(reference.h2).toBe(7);
    expect(reference.h3).toBe(6);
    for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
      expect(sections(desktopGuide(locale))).toEqual(reference);
      expect(sections(webGuide(locale))).toEqual(reference);
      expect(desktopGuide(locale)).toContain('get_translation_chunk');
      expect(desktopGuide(locale)).toContain('AGENTS.md');
    }
    expect(desktopGuide('en-US')).toMatch(/^# Tsukuyomi quick start guide/);
    expect(desktopGuide('en-US')).toMatch(/First-time setup/i);
  });
});
