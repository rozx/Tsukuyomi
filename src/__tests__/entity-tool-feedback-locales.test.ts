import { describe, expect, it } from 'vitest';
import './setup';
import { terminologyTools } from '../services/ai/tools/terminology-tools';
import { characterTools } from '../services/ai/tools/character-tools';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { buildErrorToolResult } from '../services/ai/tools/tool-call-invoker';
import { memoryTools } from '../services/ai/tools/memory-tools';
import { MemoryService } from '../services/memory-service';
import { navigationTools } from '../services/ai/tools/navigation-tools';
import { askUserTools } from '../services/ai/tools/ask-user-tools';
import { todoListTools } from '../services/ai/tools/todo-list-tools';
import type { AppLocale } from '../models/locale';
import { localizedErrorMessage } from '../utils/localized-error';
const cases = [
  ['create_term', terminologyTools, 'Term created', '術語建立成功'],
  ['create_character', characterTools, 'Character created', '角色建立成功'],
] as const;
describe('术语和角色工具自然语言反馈', () => {
  it('未匹配查询的失败身份不依赖本地化说明', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    for (const [name, tools, code] of [
      ['get_term', terminologyTools, 'TERM_NOT_FOUND'],
      ['get_character', characterTools, 'CHARACTER_NOT_FOUND'],
    ] as const) {
      const handler = tools.find((tool) => tool.definition.function.name === name)!.handler;
      for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
        const name = 'missing|{id}';
        const result = JSON.parse(
          await handler(
            { name, include_memory: false },
            {
              bookId: 'fixture-book',
              languages: captureExecutionLanguages(locale),
            },
          ),
        );
        expect(result.success).toBe(false);
        expect(result.error_code).toBe(code);
        expect(result.message).toContain(name);
        if (locale === 'en-US') expect(result.message).toContain('was not found');
      }
    }
  });
  it('待办创建与自动推进说明使用执行语言，自由文本保留', async () => {
    const handler = todoListTools.find(
      (tool) => tool.definition.function.name === 'create_todo',
    )!.handler;
    const result = JSON.parse(
      await handler(
        { text: '用户任务原文 | {task}' },
        {
          taskId: 'localized-todo',
          languages: captureExecutionLanguages('en-US'),
        },
      ),
    );
    expect(result.message).toContain('Todo created');
    expect(result.message).toContain('advanced');
    expect(result.todo.text).toBe('用户任务原文 | {task}');
    expect(result.todo.status).toBe('working');
  });
  it('待办服务的不存在错误使用稳定身份和执行语言', async () => {
    const handler = todoListTools.find(
      (tool) => tool.definition.function.name === 'update_todos',
    )!.handler;
    let failure: unknown;
    try {
      await handler(
        { id: 'absent', text: '用户文字' },
        { languages: captureExecutionLanguages('en-US') },
      );
    } catch (error) {
      failure = error;
    }
    const result = JSON.parse(
      buildErrorToolResult(
        { id: 'c', type: 'function', function: { name: 'update_todos', arguments: '{}' } },
        failure,
        'en-US',
      ).content,
    );
    expect(result.error_code).toBe('TODO_NOT_FOUND');
    expect(result.error).toBe('Todo not found: absent');
  });
  it('第三方对象诊断不当成自有说明翻译', () => {
    expect(
      localizedErrorMessage({ message: '第三方原始诊断' }, 'en-US', 'aiToolFeedback.unknownError'),
    ).toBe('第三方原始诊断');
  });
  it('导航和问答入参错误使用英文，未触发 UI 操作', async () => {
    for (const [name, tools, args, code, text] of [
      ['navigate_to_chapter', navigationTools, {}, 'BOOK_ID_REQUIRED', 'Book ID is required'],
      ['ask_user', askUserTools, { question: '' }, 'QUESTION_REQUIRED', 'A question is required'],
    ] as const) {
      const handler = tools.find((tool) => tool.definition.function.name === name)!.handler;
      const result = JSON.parse(
        await handler(args, { languages: captureExecutionLanguages('en-US') }),
      );
      expect(result.error_code).toBe(code);
      expect(result.error).toBe(text);
    }
  });
  it('记忆工具的校验与保存说明用英文，记忆内容保持用户原文', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const handler = memoryTools.find(
      (tool) => tool.definition.function.name === 'create_memory',
    )!.handler;
    const context = { bookId: 'fixture-book', languages: captureExecutionLanguages('en-US') };
    const invalid = JSON.parse(await handler({ content: '', summary: 'summary' }, context));
    expect(invalid.error_code).toBe('MEMORY_CONTENT_REQUIRED');
    expect(invalid.error).toBe('Memory content is required');
    const created = JSON.parse(
      await handler({ content: '用户原文 | {text}', summary: '原始摘要' }, context),
    );
    expect(created.message).toBe('Memory created');
    const saved = (await MemoryService.getMemory('fixture-book', created.memory.id))!;
    expect(saved.content).toBe('用户原文 | {text}');
    expect(saved.summary).toBe('原始摘要');
  });
  it('实体服务的不存在错误按执行语言渲染，ID 不被改写', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const handler = terminologyTools.find(
      (tool) => tool.definition.function.name === 'update_term',
    )!.handler;
    let failure: unknown;
    try {
      await handler(
        { term_id: 'unknown|{id}', translation: 'Target' },
        {
          bookId: 'fixture-book',
          languages: captureExecutionLanguages('en-US'),
        },
      );
    } catch (error) {
      failure = error;
    }
    const result = JSON.parse(
      buildErrorToolResult(
        { id: 'c', type: 'function', function: { name: 'update_term', arguments: '{}' } },
        failure,
        'en-US',
      ).content,
    );
    expect(result.error_code).toBe('TERM_NOT_FOUND');
    expect(result.error).toBe('Term not found: unknown|{id}');
  });
  for (const [name, tools, english, traditional] of cases) {
    for (const locale of ['en-US', 'zh-TW'] as const) {
      it(`${name} ${locale} 创建说明不改写用户字段`, async () => {
        await chapterTranslationFixture([translationChapter('c', '11111111')]);
        const handler = tools.find((tool) => tool.definition.function.name === name)!.handler;
        const result = JSON.parse(
          await handler(
            { name: 'Source {name} | text', translation: 'Target', description: '用户原文' },
            {
              bookId: 'fixture-book',
              languages: captureExecutionLanguages(locale, 'en-US'),
            },
          ),
        );
        expect(result.message).toBe(locale === 'en-US' ? english : traditional);
        const entity = result.term ?? result.character;
        expect(entity.name).toBe('Source {name} | text');
        expect(entity.description).toBe('用户原文');
      });
    }
    it(`${name} 必填错误码不依赖显示语言`, async () => {
      const handler = tools.find((tool) => tool.definition.function.name === name)!.handler;
      const results = [];
      for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as AppLocale[]) {
        let failure: unknown;
        try {
          await handler({}, { languages: captureExecutionLanguages(locale) });
        } catch (error) {
          failure = error;
        }
        const response = buildErrorToolResult(
          { id: 'c', type: 'function', function: { name, arguments: '{}' } },
          failure,
          locale,
        );
        results.push(JSON.parse(response.content));
      }
      expect(results.map((result) => result.error_code)).toEqual([
        'BOOK_ID_REQUIRED',
        'BOOK_ID_REQUIRED',
        'BOOK_ID_REQUIRED',
      ]);
      expect(results[2]!.error).toBe('Book ID is required');
    });
  }
});
