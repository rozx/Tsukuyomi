import { describe, expect, it } from 'vitest';
import { ALL_AGENT_MCP_TOOLS } from 'src/services/agent-mcp';
import { SHARED_TOOL_GUIDANCE } from 'src/services/agent-mcp/tools/shared-descriptions';
import { describeTool } from 'src/services/ai/tools/tool-localization';
import messages from 'src/i18n';

const externalTool = (name: string) => ALL_AGENT_MCP_TOOLS.find((tool) => tool.name === name)!;

describe('外部工具说明与站内工具说明共用同一份文字', () => {
  it('对应表里的每个外部工具，说明都包含站内对应工具的说明原文', () => {
    const pairs = Object.entries(SHARED_TOOL_GUIDANCE);
    expect(pairs.length).toBeGreaterThanOrEqual(9);
    for (const [external, builtinPath] of pairs) {
      const tool = externalTool(external);
      expect(tool, `${external} 不是已注册的外部工具`).toBeDefined();
      expect(tool.description, `${external} 的说明没有带上站内 ${builtinPath} 的说明`).toContain(
        describeTool(builtinPath, 'external'),
      );
    }
  });

  it('只有工具名与参数写法因使用方而异，其余文字相同', () => {
    // 不涉及工具名的说明：外部取到的与站内完全一样
    for (const path of ['get_special_instructions', 'get_occurrences_by_keywords', 'delete_term']) {
      expect(describeTool(path, 'external')).toBe(describeTool(path));
    }
    // 涉及工具名的说明：外部版本用外部的工具名，不出现站内专有的工具名
    const memory = describeTool('search_memories', 'external');
    expect(memory).toContain('记忆补充结构化资料，不替代数据库');
    expect(memory).toContain('list_characters 或 list_terms');
    expect(memory).not.toMatch(/get_character|get_term|find_paragraph_by_keywords/);
    expect(describeTool('search_memories')).toContain('find_paragraph_by_keywords');

    expect(describeTool('query_chapter', 'external')).toContain('get_chapter_paragraphs');
    expect(describeTool('query_chapter', 'external')).not.toContain('get_chapter_info');

    const instructions = describeTool('update_special_instructions', 'external');
    expect(instructions).toContain('章节级指令会覆盖书籍级同类指令');
    expect(instructions).toContain('chapter_id');
    expect(instructions).not.toContain('scope=book');
  });

  it('外部一侧不再把记忆叫作剧情记忆', () => {
    for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
      const tools = messages[locale].agentMcp.tools as Record<string, string>;
      for (const name of ['search_memories', 'upsert_memory', 'list_memories']) {
        expect(tools[name], `${locale} ${name}`).not.toMatch(/剧情|劇情|plot/i);
      }
    }
    const translate = JSON.stringify(
      ALL_AGENT_MCP_TOOLS.filter((tool) => tool.name.includes('memor')).map(
        (tool) => tool.description,
      ),
    );
    expect(translate).not.toMatch(/plot point|world fact/);
  });
});
