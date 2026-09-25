import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalConfig } from 'src/services/global-config-cache';
import { ToolRegistry } from 'src/services/ai/tools';

const hasWebTools = (tools: Array<{ function: { name: string } }>) =>
  ['search_web', 'fetch_webpage'].map((name) => tools.some((t) => t.function.name === name));

let tavilyKey: string | undefined;
let fallbackEnabled: boolean;

beforeEach(() => {
  tavilyKey = undefined;
  fallbackEnabled = true;
  vi.spyOn(GlobalConfig, 'getTavilyApiKey').mockImplementation(() => tavilyKey);
  vi.spyOn(GlobalConfig, 'getFirecrawlFallbackEnabled').mockImplementation(() => fallbackEnabled);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('网络工具可用性按上下文区分', () => {
  it('无 Tavily Key、回退开启：助手聊天提供，翻译 / 润色任务不提供', () => {
    expect(hasWebTools(ToolRegistry.getAssistantToolsExcludingTranslationManagement('b'))).toEqual(
      [true, true],
    );
    expect(hasWebTools(ToolRegistry.getAssistantTools('b'))).toEqual([true, true]);
    expect(hasWebTools(ToolRegistry.getTranslationTools('b'))).toEqual([false, false]);
    expect(hasWebTools(ToolRegistry.getToolsExcludingTranslationManagement('b'))).toEqual([
      false,
      false,
    ]);
    expect(hasWebTools(ToolRegistry.getSingleParagraphPolishTools('b'))).toEqual([false, false]);
  });

  it('配置 Tavily Key：所有上下文都提供', () => {
    tavilyKey = 'tvly-abc';
    expect(hasWebTools(ToolRegistry.getAssistantTools('b'))).toEqual([true, true]);
    expect(hasWebTools(ToolRegistry.getTranslationTools('b'))).toEqual([true, true]);
    expect(hasWebTools(ToolRegistry.getSingleParagraphPolishTools('b'))).toEqual([true, true]);
  });

  it('无 Tavily Key、回退关闭：任何上下文都不提供', () => {
    fallbackEnabled = false;
    expect(hasWebTools(ToolRegistry.getAssistantTools('b'))).toEqual([false, false]);
    expect(hasWebTools(ToolRegistry.getTranslationTools('b'))).toEqual([false, false]);
  });
});
