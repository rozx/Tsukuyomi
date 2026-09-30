import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ToolRegistry } from '../services/ai/tools/tool-registry';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { TodoListService } from '../services/todo-list-service';
import { APP_LOCALES } from '../models/locale';
import type { AppLocale } from '../models/locale';
import type { AITool, AIToolCall } from '../services/ai/types/ai-service';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';

const CJK = /[぀-ヿ一-鿿]/;
const BOOK = 'fixture-book';

afterEach(() => {
  vi.restoreAllMocks();
  TodoListService.clearAllTodos();
});

const names = (tools: AITool[]) => tools.map((tool) => tool.function.name);

function call(name: string, args: unknown): AIToolCall {
  const raw = typeof args === 'string' ? args : JSON.stringify(args);
  return { id: `call-${name}`, type: 'function', function: { name, arguments: raw } };
}

/** 业务结果的协议部分：成功标志、错误码及字段集合，自然语言说明不参与比较。 */
function protocol(content: string) {
  const data = JSON.parse(content) as Record<string, unknown>;
  return { success: data.success, error_code: data.error_code, keys: Object.keys(data).sort() };
}

async function invoke(locale: AppLocale, toolCall: AIToolCall) {
  return ToolRegistry.handleToolCall(toolCall, {
    bookId: BOOK,
    languages: captureExecutionLanguages(locale, 'en-US'),
  });
}

describe('工具执行的语言上下文', () => {
  it('各场景的工具集合（权限）在三种执行语言下完全相同', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const sets = (locale: AppLocale) => [
      names(ToolRegistry.getAssistantToolsExcludingTranslationManagement(BOOK, locale)),
      names(ToolRegistry.getTranslationTools(BOOK, { excludeAskUser: true }, locale)),
      names(ToolRegistry.getSingleParagraphPolishTools(BOOK, locale)),
      names(ToolRegistry.getAssistantToolsExcludingTranslationManagement(undefined, locale)),
    ];
    const reference = sets('zh-CN');
    expect(reference.every((list) => list.length > 0)).toBe(true);
    for (const locale of APP_LOCALES) expect(sets(locale)).toEqual(reference);
  });

  it('同一调用的成功标志、错误码与结果字段三语言一致，反馈使用执行语言', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const calls = [
      call('get_term', { name: 'missing-term' }),
      call('get_character', { name: 'missing-character' }),
      call('get_paragraph_info', { paragraph_id: 'ffffffff' }),
      call('select_translation', { paragraph_id: '11111111', translation_id: 'nope' }),
      call('get_chapter_info', { chapter_id: 'missing-chapter' }),
      call('get_memory', { memory_id: 'missing-memory' }),
      call('list_terms', {}),
      call('get_book_info', {}),
      call('get_term', '{"name": '),
      call('no_such_tool', {}),
    ];
    for (const toolCall of calls) {
      const results = await Promise.all(APP_LOCALES.map((locale) => invoke(locale, toolCall)));
      const [reference, ...others] = results.map((result) => protocol(result.content));
      for (const other of others) expect(other, toolCall.function.name).toEqual(reference);
      const english = results[APP_LOCALES.indexOf('en-US')]!.content;
      expect(CJK.test(english), `${toolCall.function.name}: ${english}`).toBe(false);
    }
  });
});
