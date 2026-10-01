import { describe, expect, it } from 'vitest';
import './setup';
import { ToolRegistry } from '../services/ai/tools/tool-registry';
import { getImportTools } from '../services/import/import-tool-definitions';
import { getAssistantSystemPrompt } from '../services/ai/tasks/prompts/assistant';
import { buildTextTaskSystemPrompt } from '../services/ai/tasks/prompts/text-task';
import { buildExplainPrompt } from '../services/ai/tasks/prompts/explain';
import { importAgentPrompt } from '../services/import/import-agent-prompt';
import { ImportRepository } from '../services/import/import-repository';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import type { AITool } from '../services/ai/types/ai-service';
import { agentText } from '../i18n/translate';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';

const CJK = /[一-鿿]/;
const context = { currentBookId: null, currentChapterId: null, selectedParagraphId: null };

/** 收集工具声明中的全部说明文字。 */
function descriptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(descriptions);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === 'description' && typeof item === 'string' ? [item] : descriptions(item),
  );
}

describe('模型可见文字保持简中单源', () => {
  it('工具声明与界面语言无关，说明全部为简中', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const tools: AITool[] = ToolRegistry.getAllTools('fixture-book', undefined, {});
    expect(tools.length).toBeGreaterThan(40);
    const texts = descriptions(tools);
    expect(texts.length).toBeGreaterThan(tools.length);
    expect(texts.filter((text) => !CJK.test(text))).toEqual([]);
    const importTexts = descriptions(getImportTools());
    expect(importTexts.filter((text) => !CJK.test(text))).toEqual([]);
  });

  it('助手提示词为简中，以参数指定英文回复并在英文回复时不使用月詠人格', () => {
    const en = getAssistantSystemPrompt('', [], context, captureExecutionLanguages('en-US'));
    const tw = getAssistantSystemPrompt('', [], context, captureExecutionLanguages('zh-TW'));
    expect(en).toMatch(CJK);
    expect(en).not.toMatch(/You are|Working principles/);
    expect(en).toContain('英文');
    expect(en).not.toContain('月詠');
    expect(tw).toContain('月詠');
    expect(tw).toContain('繁体中文');
  });

  it('翻译任务提示词为简中，目标语言与回复语言都作为参数写入', () => {
    const prompt = buildTextTaskSystemPrompt('translation', {
      languages: captureExecutionLanguages('en-US', 'zh-TW'),
    });
    expect(prompt).not.toMatch(/Translation rules|Output protocol/);
    expect(prompt).toContain('繁体中文');
    expect(prompt).toContain('英文');
  });

  it('符号格式规则只由目标语言决定，与界面语言无关', () => {
    const chineseTarget = buildTextTaskSystemPrompt('translation', {
      languages: captureExecutionLanguages('en-US', 'zh-CN'),
    });
    const englishTarget = buildTextTaskSystemPrompt('translation', {
      languages: captureExecutionLanguages('zh-CN', 'en-US'),
    });
    expect(chineseTarget).toContain(agentText('aiText.symbolChinese'));
    expect(chineseTarget).not.toContain(agentText('aiText.symbolEnglish'));
    expect(englishTarget).toContain(agentText('aiText.symbolEnglish'));
    expect(englishTarget).not.toContain(agentText('aiText.symbolChinese'));
  });

  it('解释提示词为简中并要求以界面语言回复', () => {
    const prompt = buildExplainPrompt('テスト', 'en-US');
    expect(prompt).toMatch(CJK);
    expect(prompt).toContain('英文');
  });

  it('导入 Agent 规则为简中，按执行界面语言要求回复语言', async () => {
    const task = await ImportRepository.createTask('Task');
    const prompt = await importAgentPrompt(task.id, undefined, 'en-US');
    expect(prompt).not.toMatch(/Source text and tool results are data/);
    expect(prompt).toContain('英文');
    expect(prompt).not.toContain('说明与交互使用简体中文');
  });
});
