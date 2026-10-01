import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { agentText } from '../i18n/translate';
import { ImportMetadataService } from '../services/import/import-metadata-service';
import { ImportRepository } from '../services/import/import-repository';
import { localizeImportFeedback } from '../services/import/import-error';
import { importEventsToMessages } from '../composables/import-page/import-chat-messages';
import { webSearchTools } from '../services/ai/tools/web-search-tools';
import { GlobalConfig } from '../services/global-config-cache';
import { FirecrawlClient } from '../services/firecrawl/firecrawl-client';
import { FirecrawlQuotaError } from '../services/firecrawl/firecrawl-errors';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import type { ImportEvent } from '../models/import';
import type { AppLocale } from '../models/locale';

const CJK = /[぀-ヿ㐀-鿿]/;

afterEach(() => vi.restoreAllMocks());

function configure(apiKey: string, fallback: boolean) {
  vi.spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue();
  vi.spyOn(GlobalConfig, 'getTavilyApiKey').mockReturnValue(apiKey);
  vi.spyOn(GlobalConfig, 'getFirecrawlFallbackEnabled').mockReturnValue(fallback);
}

/** 模拟工具执行器保存的工作台事件：数据按执行时的界面语言投影后写入。 */
function searchEvents(stored: unknown): ImportEvent[] {
  return [
    {
      id: 'm',
      taskId: 'task',
      sequence: 1,
      createdAt: 1,
      kind: 'message',
      data: {},
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'w',
            type: 'function',
            function: { name: 'search_web', arguments: JSON.stringify({ query: 'moon novel' }) },
          },
        ],
      },
    },
    {
      id: 'r',
      taskId: 'task',
      sequence: 2,
      createdAt: 2,
      kind: 'tool-result',
      callId: 'w',
      toolName: 'search_web',
      data: stored,
    },
  ];
}

function searchAction(stored: unknown, uiLocale: AppLocale) {
  const [message] = importEventsToMessages(searchEvents(stored), {
    uiLocale,
    sourceNames: new Map(),
  });
  const action = message!.actions![0]!;
  return {
    name: action.name ?? '',
    details: (action.descriptionDetails ?? []).map((detail) => detail.value).join('\n'),
  };
}

describe('导入 search_web 失败携带可重投影的本地化记录', () => {
  it('同一条保存的失败事件，英文与繁中界面各自显示本语言说明', async () => {
    configure('', false);
    const task = await ImportRepository.createTask();
    const prepared = await ImportMetadataService.prepareSearch(task.id, 'moon novel');
    // 事件在英文界面执行时保存
    const stored = localizeImportFeedback(prepared.result, 'en-US');
    const en = searchAction(stored, 'en-US');
    expect(en.name).toContain('moon novel');
    expect(`${en.name}\n${en.details}`).not.toMatch(CJK);
    const tw = searchAction(stored, 'zh-TW');
    expect(tw.name).toContain('未設定網路搜尋');
    expect(tw.details).toContain('設定');
    expect(`${tw.name}\n${tw.details}`).not.toMatch(/[网络设置请]/);
  });

  it('返回给模型的说明仍为简中单源，保留错误码', async () => {
    configure('', false);
    const task = await ImportRepository.createTask();
    const prepared = await ImportMetadataService.prepareSearch(task.id, 'moon novel');
    const model = JSON.parse(JSON.stringify(localizeImportFeedback(prepared.result, 'zh-CN')));
    expect(model.error_code).toBe('WEB_SEARCH_NOT_CONFIGURED');
    expect(model.error.message).toBe(agentText('aiWebFeedback.searchMissing'));
    expect(model.message.message).toBe(agentText('aiWebFeedback.searchConfigure'));
    // 英文界面保存的事件在投影回模型语言时恢复简中
    const reprojected = localizeImportFeedback(
      localizeImportFeedback(prepared.result, 'en-US'),
      'zh-CN',
    );
    expect(reprojected.message).toEqual(prepared.result.message);
  });

  it('带参数的 Firecrawl 额度失败同样可重投影', async () => {
    configure('', true);
    vi.spyOn(FirecrawlClient, 'search').mockRejectedValue(new FirecrawlQuotaError(true));
    const task = await ImportRepository.createTask();
    const prepared = await ImportMetadataService.prepareSearch(task.id, 'moon novel');
    expect(prepared.result.error_code).toBe('FIRECRAWL_QUOTA_EXHAUSTED');
    const en = searchAction(localizeImportFeedback(prepared.result, 'zh-TW'), 'en-US');
    expect(`${en.name}\n${en.details}`).not.toMatch(CJK);
  });

  it('旧记录中的简中字符串说明保持原样显示', () => {
    const legacy = {
      success: false,
      error_code: 'WEB_SEARCH_NOT_CONFIGURED',
      error: '未配置网络搜索',
      message: '请在设置中配置',
      results: [],
    };
    expect(searchAction(legacy, 'en-US').name).toContain('未配置网络搜索');
  });

  it('普通助手的 search_web 返回不包含工作台专用的本地化记录', async () => {
    configure('', false);
    const search = webSearchTools.find((tool) => tool.definition.function.name === 'search_web')!;
    const raw = await search.handler(
      { query: 'moon' },
      { languages: captureExecutionLanguages('en-US') },
    );
    const parsed = JSON.parse(raw);
    expect(Object.keys(parsed).sort()).toEqual(['error', 'error_code', 'message', 'success']);
    expect(parsed.message).toBe(agentText('aiWebFeedback.searchConfigure'));
  });
});
