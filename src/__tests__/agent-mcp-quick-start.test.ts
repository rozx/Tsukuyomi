import { describe, expect, it } from 'vitest';
import { ALL_AGENT_MCP_TOOLS } from 'src/services/agent-mcp';
import { buildAgentQuickStartGuide } from 'src/services/agent-mcp/agent-quick-start';

describe('buildAgentQuickStartGuide', () => {
  it('桌面通道的指南说明服务名、了解现状的工具、各类任务与规则，并引用 MCP 提示词', () => {
    const guide = buildAgentQuickStartGuide({ locale: 'zh-CN', channel: 'desktop-mcp' });

    expect(guide).toContain('tsukuyomi');
    // 了解现状
    for (const tool of ['get_app_context', 'list_books', 'get_book']) expect(guide).toContain(tool);
    // 四类常见任务
    for (const tool of [
      'get_translation_chunk',
      'submit_translations',
      'import_book_from_url',
      'create_book',
      'add_chapters',
      'check_book_updates',
      'apply_book_updates',
      'upsert_terms',
      'upsert_characters',
    ])
      expect(guide).toContain(tool);
    // 工作流来自 MCP Prompt
    expect(guide).toContain('prompts/get');
    expect(guide).toContain('translate-chapter');
    expect(guide).toContain('polish-chapter');
    expect(guide).toContain('import-and-translate');
    expect(guide).not.toContain('get_workflow_guide');
    // 破坏性操作前要确认
    expect(guide).toContain('include_updated');
  });

  it('是通用指南而不是具体任务：不包含书名、book_id 取值或待填地址', () => {
    const guide = buildAgentQuickStartGuide({ locale: 'zh-CN', channel: 'desktop-mcp' });
    expect(guide).not.toMatch(/book_id\s*[:：]/);
    expect(guide).not.toContain('<');
    expect(guide).not.toContain('《');
  });

  it('WebMCP 通道改用 get_workflow_guide，不提 prompts/get', () => {
    const guide = buildAgentQuickStartGuide({ locale: 'zh-CN', channel: 'webmcp' });
    expect(guide).toContain('WebMCP');
    expect(guide).toContain('get_workflow_guide');
    expect(guide).not.toContain('prompts/get');
  });

  it('指南里提到的工具名都是真实注册的工具', () => {
    const known = new Set(ALL_AGENT_MCP_TOOLS.map((tool) => tool.name));
    for (const channel of ['desktop-mcp', 'webmcp'] as const) {
      const guide = buildAgentQuickStartGuide({ locale: 'en-US', channel });
      const mentioned = guide.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
      const notTools = new Set([
        'remaining_untranslated_count',
        'has_more',
        'include_updated',
        'task_type',
        'next_cursor',
      ]);
      for (const name of mentioned) {
        if (notTools.has(name)) continue;
        expect(known.has(name), `${name} 不是已注册的工具`).toBe(true);
      }
    }
  });

  it('按界面语言输出，三种语言都保留工具名原文并使用 Markdown 小节', () => {
    for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
      const guide = buildAgentQuickStartGuide({ locale, channel: 'desktop-mcp' });
      expect(guide).toContain('get_translation_chunk');
      expect(guide).toMatch(/^# /m);
      expect(guide.match(/^## /gm)?.length).toBe(3);
    }
    expect(buildAgentQuickStartGuide({ locale: 'en-US', channel: 'desktop-mcp' })).toMatch(
      /Quick start/i,
    );
  });
});
