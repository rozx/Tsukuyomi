import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ToolRegistry } from '../services/ai/tools/tool-registry';
import type { ToolDefinition } from '../services/ai/tools/types';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { TodoListService } from '../services/todo-list-service';
import { useAIProcessingStore } from '../stores/ai-processing';
import { createAIProcessingStoreAdapter } from '../services/ai/tasks/utils/task-types';
import { APP_LOCALES } from '../models/locale';
import type { AppLocale } from '../models/locale';
import type { AIToolCall } from '../services/ai/types/ai-service';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { useBooksStore } from '../stores/books';

const CJK = /[぀-ヿ一-鿿]/;
const BOOK = 'fixture-book';

afterEach(() => {
  vi.restoreAllMocks();
  TodoListService.clearAllTodos();
});

function definitions(): ToolDefinition[] {
  return (
    ToolRegistry as unknown as { getAllToolDefinitions(): ToolDefinition[] }
  ).getAllToolDefinitions();
}

function call(name: string, args: Record<string, unknown>): AIToolCall {
  return {
    id: `call-${name}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

/** 协议部分：成功标志与错误码；自然语言说明不参与比较。 */
function protocol(content: string) {
  try {
    const data = JSON.parse(content) as Record<string, unknown>;
    return { success: data.success, error_code: data.error_code };
  } catch {
    return { raw: 'non-json' };
  }
}

async function invoke(locale: AppLocale, toolCall: AIToolCall, taskId: string) {
  return ToolRegistry.handleToolCall(toolCall, {
    bookId: BOOK,
    taskId,
    languages: captureExecutionLanguages(locale, 'en-US'),
    aiProcessingStore: createAIProcessingStoreAdapter(useAIProcessingStore()),
    aiModelId: 'fixture-model',
    paragraphIds: ['11111111'],
  });
}

describe('注册工具全集的反馈语言', () => {
  it('每个工具的参数校验反馈三语言协议一致，英文不含中文', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const taskId = await useAIProcessingStore().addTask({
      type: 'translation',
      modelName: 'Fixture',
      status: 'thinking',
      workflowStatus: 'working',
      message: '',
      thinkingMessage: '',
    });
    const leaks: string[] = [];
    const mismatches: string[] = [];
    for (const { definition } of definitions()) {
      const name = definition.function.name;
      const toolCall = call(name, {});
      const results = [];
      for (const locale of APP_LOCALES) results.push(await invoke(locale, toolCall, taskId));
      const [reference, ...others] = results.map((result) => protocol(result.content));
      if (others.some((other) => JSON.stringify(other) !== JSON.stringify(reference)))
        mismatches.push(name);
      const english = results[APP_LOCALES.indexOf('en-US')]!.content;
      if (CJK.test(english)) leaks.push(`${name}: ${english.slice(0, 200)}`);
    }
    expect(mismatches).toEqual([]);
    expect(leaks).toEqual([]);
  });

  it('逐个工具以真实参数执行：成功与业务失败的协议三语言一致，英文反馈不含中文', async () => {
    const runs: Record<string, { name: string; content: string }[]> = {};
    for (const locale of APP_LOCALES) runs[locale] = await scenario(locale);
    const names = runs['zh-CN']!.map((entry) => entry.name);
    const covered = new Set(names);
    // 网络、帮助文档与阻塞式提问工具由各自的语言测试覆盖（web/help/ask 测试）
    const external = [
      'search_web',
      'fetch_webpage',
      'search_help_docs',
      'get_help_doc',
      'navigate_to_help_doc',
      'list_help_docs',
    ];
    expect(
      definitions()
        .map(({ definition }) => definition.function.name)
        .filter((name) => !covered.has(name) && !external.includes(name)),
    ).toEqual([]);
    const mismatches: string[] = [];
    for (const locale of APP_LOCALES) {
      runs[locale]!.forEach((entry, index) => {
        const reference = runs['zh-CN']![index]!;
        if (JSON.stringify(protocol(entry.content)) !== JSON.stringify(protocol(reference.content)))
          mismatches.push(`${locale} ${entry.name}: ${entry.content.slice(0, 160)}`);
      });
    }
    expect(mismatches).toEqual([]);
    const leaks = runs['en-US']!.filter((entry) => CJK.test(entry.content)).map(
      (entry) => `${entry.name}: ${entry.content.slice(0, 240)}`,
    );
    expect(leaks).toEqual([]);
  });
});

/** 深度查找第一个名为 key 的字符串字段。 */
function find(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  for (const [k, item] of Object.entries(value)) {
    if (k === key && typeof item === 'string') return item;
    const nested = find(item, key);
    if (nested) return nested;
  }
  return undefined;
}

async function scenario(locale: AppLocale): Promise<{ name: string; content: string }[]> {
  TodoListService.clearAllTodos();
  const first = translationChapter('c', '11111111');
  first.title = 'Chapter one';
  const second = translationChapter('c2', '22222222');
  second.title = 'Chapter two';
  await chapterTranslationFixture([first, second]);
  const taskId = await useAIProcessingStore().addTask({
    type: 'translation',
    modelName: 'Fixture',
    status: 'thinking',
    workflowStatus: 'working',
    message: '',
    thinkingMessage: '',
    bookId: BOOK,
    chapterId: 'c',
  });
  const out: { name: string; content: string }[] = [];
  const run = async (name: string, args: Record<string, unknown>) => {
    const result = await invoke(locale, call(name, args), taskId);
    out.push({ name, content: result.content });
    try {
      return JSON.parse(result.content) as unknown;
    } catch {
      return undefined;
    }
  };
  const book = () => useBooksStore().getBookById(BOOK)!;

  await run('create_term', { name: 'Alpha', translation: 'Alpha EN', description: 'A term' });
  await run('create_term', { name: 'Alpha', translation: 'Again' });
  await run('get_term', { name: 'Alpha', include_memory: true });
  await run('list_terms', {});
  await run('search_terms_by_keywords', { keywords: ['Alpha'] });
  await run('get_occurrences_by_keywords', { keywords: ['source'] });
  const termId = book().terminologies?.[0]?.id ?? 'missing';
  await run('update_term', { term_id: termId, translation: 'Alpha Two' });
  await run('update_term', { term_id: 'missing-term', translation: 'x' });

  await run('create_character', {
    name: 'Bob',
    translation: 'Bob EN',
    sex: 'male',
    description: 'A person',
    aliases: [{ name: 'Bobby', translation: 'Bobby EN' }],
  });
  await run('create_character', { name: 'Bob', translation: 'Bob Again' });
  await run('get_character', { name: 'Bob' });
  await run('search_characters_by_keywords', { keywords: ['Bob'] });
  await run('list_characters', {});
  const characterId = book().characterSettings?.[0]?.id ?? 'missing';
  await run('update_character', { character_id: characterId, speaking_style: 'Calm' });
  await run('update_character', { character_id: 'missing-character', description: 'x' });

  await run('get_paragraph_position', { paragraph_id: '11111111', include_next: true });
  await run('get_paragraph_info', { paragraph_id: '11111111' });
  await run('get_previous_paragraphs', { paragraph_id: '22222222', count: 2 });
  await run('get_next_paragraphs', { paragraph_id: '11111111', count: 2 });
  await run('find_paragraph_by_keywords', { keywords: ['source'] });
  await run('search_paragraphs_by_regex', { regex_pattern: 'source' });
  await run('search_paragraphs_by_regex', { regex_pattern: '(' });
  await run('add_translation', { paragraph_id: '11111111', translation: 'First EN' });
  await run('add_translation', { paragraph_id: '11111111', translation: 'Second EN' });
  const history = await run('get_translation_history', { paragraph_id: '11111111' });
  const translationId = find(history, 'id') ?? find(history, 'translation_id') ?? 'missing';
  await run('update_translation', {
    paragraph_id: '11111111',
    translation_id: translationId,
    new_translation: 'Edited EN',
  });
  await run('select_translation', { paragraph_id: '11111111', translation_id: translationId });
  await run('select_translation', { paragraph_id: '11111111', translation_id: 'missing' });
  await run('batch_replace_translations', { keywords: ['EN'], replacement_text: 'XX' });
  await run('remove_translation', { paragraph_id: '11111111', translation_id: translationId });

  await run('get_book_info', {});
  await run('update_book_info', { description: 'Updated', tags: ['tag'] });
  await run('list_chapters', {});
  await run('list_chapters_by_volume', { volume_ids: ['fixture-volume'] });
  await run('list_chapters_by_volume', { volume_ids: ['missing-volume'] });
  await run('query_chapter', { query: 'Bob walks' });
  await run('get_chapter_info', { chapter_id: 'c' });
  await run('get_previous_chapter', { chapter_id: 'c2' });
  await run('get_previous_chapter', { chapter_id: 'c' });
  await run('get_next_chapter', { chapter_id: 'c' });
  await run('get_next_chapter', { chapter_id: 'c2' });
  await run('update_chapter_title', { chapter_id: 'c', title_translation: 'Chapter One EN' });

  const memory = await run('create_memory', { content: 'Bob is calm', summary: 'Bob tone' });
  const memoryId = find(memory, 'memory_id') ?? find(memory, 'id') ?? 'missing';
  await run('list_memories', { include_content: true });
  await run('get_memory', { memory_id: memoryId });
  await run('search_memories', { query: 'Bob' });
  await run('update_memory', { memory_id: memoryId, content: 'Bob is quiet', summary: 'Bob' });
  await run('delete_memory', { memory_id: memoryId });
  await run('delete_memory', { memory_id: memoryId });

  const todo = await run('create_todo', { text: 'Check names' });
  const todoId = find(todo, 'id') ?? 'missing';
  await run('list_todos', { filter: 'all' });
  await run('update_todos', { id: todoId, text: 'Check all names' });
  await run('mark_todo_working', { id: todoId });
  await run('mark_todo_done', { id: todoId });
  await run('mark_todo_done', { id: 'missing-todo' });
  await run('delete_todo', { id: todoId });

  await run('ask_user_batch', { questions: [] });
  const bridge = window as unknown as Record<string, unknown>;
  bridge.__lunaAskUser = () => Promise.resolve({ answer: 'Yes', selected_index: 0 });
  bridge.__lunaAskUserBatch = () =>
    Promise.resolve({ answers: [{ question_index: 0, answer: 'Yes' }] });
  await run('ask_user', { question: 'Keep the name?', suggested_answers: ['Yes', 'No'] });
  await run('ask_user_batch', { questions: [{ question: 'Keep the name?' }] });
  bridge.__lunaAskUser = () => Promise.reject(new Error('bridge failed'));
  await run('ask_user', { question: 'Keep the name?' });
  delete bridge.__lunaAskUser;
  delete bridge.__lunaAskUserBatch;
  await run('navigate_to_chapter', { chapter_id: 'c' });
  await run('navigate_to_paragraph', { paragraph_id: '11111111' });
  await run('add_translation_batch', {
    paragraphs: [{ paragraph_id: '11111111', translated_text: 'Batch EN' }],
  });
  await run('add_translation_batch', {
    paragraphs: [{ paragraph_id: '11111111', translated_text: 'source 11111111' }],
  });
  await run('add_translation_batch', {
    paragraphs: [{ paragraph_id: '11111111', translated_text: '"Unpaired quote' }],
  });
  await run('add_translation_batch', {
    paragraphs: [{ paragraph_id: 'ffffffff', translated_text: 'Nope' }],
  });
  await run('update_task_status', { status: 'review' });
  await run('update_task_status', { status: 'planning' });

  await run('delete_term', { term_id: termId });
  await run('delete_term', { term_id: termId });
  await run('delete_character', { character_id: characterId });
  return out;
}
