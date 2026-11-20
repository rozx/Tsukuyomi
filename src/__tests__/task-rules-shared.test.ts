import { describe, expect, it } from 'vitest';
import { captureExecutionLanguages } from 'src/services/ai/tasks/utils/execution-languages';
import { buildTextTaskSystemPrompt } from 'src/services/ai/tasks/prompts/text-task';

describe('站内任务提示词（规则与外部 Agent 共用同一份文字）', () => {
  // 快照取自规则抽成共用之前：之后站内最终拿到的提示词必须一字不差
  for (const taskType of ['translation', 'polish', 'proofreading'] as const) {
    for (const target of ['zh-CN', 'en-US'] as const) {
      it(`${taskType} / ${target} 的分块提示词保持不变`, () => {
        expect(
          buildTextTaskSystemPrompt(taskType, {
            languages: captureExecutionLanguages('zh-CN', target),
          }),
        ).toMatchSnapshot();
      });
    }
    it(`${taskType} 的单段提示词保持不变`, () => {
      expect(
        buildTextTaskSystemPrompt(
          taskType,
          { languages: captureExecutionLanguages('zh-CN', 'zh-CN') },
          true,
        ),
      ).toMatchSnapshot();
    });
  }
});

describe('外部 Agent 拿到的规则与站内是同一份文字', () => {
  it('标点、格式、敬语、数据管理、记忆管理的正文与站内提示词逐字相同，只有工具名与阶段不同', async () => {
    const { buildExternalTaskRules } = await import('src/services/agent-mcp/task-rules');
    const { agentText } = await import('src/i18n/translate');
    const external = buildExternalTaskRules(['translation'], 'zh-CN');
    const builtin = buildTextTaskSystemPrompt('translation', {
      languages: captureExecutionLanguages('zh-CN', 'zh-CN'),
    });

    // 与使用方无关的规则：两边原样出现
    for (const key of ['aiText.symbolChinese', 'aiText.preserveFormat'] as const) {
      expect(external).toContain(agentText(key));
      expect(builtin).toContain(agentText(key));
    }
    // 规则正文里的关键句两边都有
    for (const sentence of [
      '一个原文段落等于一个输出段落，禁止合并或拆分',
      '严禁自动将带敬语姓名添加为角色别名',
      '术语表放概念、技能、地名、物品等非人名内容，禁止放人名',
      '每个术语只用一个目标译名',
      '严禁保存故事设定、背景、世界观、剧情及情节发展',
      'summary 至多40字并含关键词',
    ]) {
      expect(external).toContain(sentence);
      expect(builtin).toContain(sentence);
    }

    // 外部没有阶段限制，工具名是外部自己的
    expect(external).not.toMatch(/planning|working|review/);
    expect(external).not.toMatch(/update_term|update_character|create_memory|get_memory/);
    expect(external).not.toContain('find_paragraph_by_keywords');
    expect(external).toContain('upsert_terms/upsert_characters');
    expect(external).toContain('upsert_memory');
    expect(external).toContain('search_paragraphs');
    // 站内仍是站内的工具名与阶段
    expect(builtin).toContain('update_term/update_character');
    expect(builtin).toContain('find_paragraph_by_keywords');
  });

  it('按目标语言给出对应的标点规则；不知道目标语言时两种都给', async () => {
    const { buildExternalTaskRules } = await import('src/services/agent-mcp/task-rules');
    const { agentText } = await import('src/i18n/translate');
    const zh = buildExternalTaskRules(['translation'], 'zh-TW');
    expect(zh).toContain(agentText('aiText.symbolChinese'));
    expect(zh).not.toContain(agentText('aiText.symbolEnglish'));
    const en = buildExternalTaskRules(['translation'], 'en-US');
    expect(en).toContain(agentText('aiText.symbolEnglish'));
    expect(en).not.toContain(agentText('aiText.symbolChinese'));
    const unknown = buildExternalTaskRules(['translation']);
    expect(unknown).toContain(agentText('aiText.symbolChinese'));
    expect(unknown).toContain(agentText('aiText.symbolEnglish'));
  });

  it('可以同时给出翻译、润色、校对各自的核心规则', async () => {
    const { buildExternalTaskRules } = await import('src/services/agent-mcp/task-rules');
    const all = buildExternalTaskRules(['translation', 'polish', 'proofreading']);
    expect(all).toContain('【核心规则】\n1. 保持准确、流畅与自然口语表达');
    expect(all).toContain('摆脱翻译腔');
    expect(all).toContain('【校对检查项】');
    // 公共规则只出现一次
    expect(all.split('【数据管理规则】').length).toBe(2);
    expect(all.split('【记忆管理】').length).toBe(2);
  });
});

describe('站内工具说明（部分与外部工具共用）', () => {
  // 快照取自说明加入「使用方片段」之前：之后站内模型看到的工具说明必须一字不差
  it('站内全部工具的说明保持不变', async () => {
    const { ToolRegistry } = await import('src/services/ai/tools/tool-registry');
    const tools = ToolRegistry.getAllTools('book', undefined, { allowFirecrawlOnly: true });
    const helpTools = ToolRegistry.getHelpDocsTools();
    const described = [...tools, ...helpTools].map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
    }));
    expect(described.length).toBeGreaterThan(40);
    expect(described).toMatchSnapshot();
  });
});
