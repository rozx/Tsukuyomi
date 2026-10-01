import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { ChapterContentService } from '../services/chapter-content-service';
import { TodoListService } from '../services/todo-list-service';
import { useAIProcessingStore } from '../stores/ai-processing';
import { getLanguageTranslation } from '../services/localization/selection';
import type { AppLocale } from '../models/locale';
import type { Paragraph } from '../models/novel';
import type { AIServiceConfig, TextGenerationRequest } from '../services/ai/types/ai-service';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  TodoListService.clearAllTodos();
});

const call = (name: string, args: unknown, turn: number) => ({
  text: '',
  toolCalls: [
    {
      id: `call-${turn}`,
      type: 'function' as const,
      function: { name, arguments: JSON.stringify(args) },
    },
  ],
});

/**
 * 按真实工作流驱动一次整章翻译：模型把块中的每个段落按 answer() 提交，
 * 经过 add_translation_batch 的全部校验与保存路径。返回模型收到的段落 ID。
 */
function scriptModel(answer: (id: string) => string) {
  const seen: string[][] = [];
  let turn = 0;
  let ids: string[] = [];
  vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
    generateText: (_config: AIServiceConfig, request: TextGenerationRequest) => {
      const task = useAIProcessingStore().activeTasks.at(-1)!;
      for (const todo of TodoListService.getTodosByTaskId(task.id))
        if (todo.status !== 'done') TodoListService.markTodoAsDone(todo.id);
      turn++;
      if (turn === 1) {
        const users = request
          .messages!.filter((message) => message.role === 'user')
          .map((message) => String(message.content))
          .join('\n');
        ids = [...new Set([...users.matchAll(/\[ID: (\w+)\]/g)].map((match) => match[1]!))];
        seen.push(ids);
        return Promise.resolve(call('update_task_status', { status: 'working' }, turn));
      }
      if (turn === 2)
        return Promise.resolve(
          call(
            'add_translation_batch',
            {
              paragraphs: ids.map((id) => ({ paragraph_id: id, translated_text: answer(id) })),
            },
            turn,
          ),
        );
      if (turn === 3)
        return Promise.resolve(call('update_task_status', { status: 'review' }, turn));
      if (turn > 8) throw new Error('UNEXPECTED_LOOP');
      return Promise.resolve(call('update_task_status', { status: 'end' }, turn));
    },
  } as never);
  return {
    seen,
    reset: () => {
      turn = 0;
    },
  };
}

async function setup(target: AppLocale, paragraphs: Paragraph[]) {
  const chapter = translationChapter('c', paragraphs[0]!.id);
  chapter.content = paragraphs;
  const fixture = await chapterTranslationFixture([chapter]);
  dispose = fixture.dispose;
  await fixture.books.updateBook('fixture-book', { targetLanguage: target });
  return fixture.mount(chapter);
}

const saved = async () => (await ChapterContentService.loadChapterContent('c'))!;

describe('已是目标语言的段落原样提交', () => {
  it('英文目标的英文原文原样提交后保存为英文译文，并计为已处理不再送审', async () => {
    const { service } = await setup('en-US', [
      { id: '11111111', text: 'Already English.', translations: [], selectedTranslationId: '' },
      { id: '22222222', text: 'これは日本語だ。', translations: [], selectedTranslationId: '' },
    ]);
    const model = scriptModel((id) =>
      id === '11111111' ? 'Already English.' : 'This is Japanese.',
    );
    await service.translateAllParagraphs();
    const [kept, translated] = await saved();
    expect(getLanguageTranslation(kept!, 'en-US')?.translation).toBe('Already English.');
    expect(getLanguageTranslation(translated!, 'en-US')?.translation).toBe('This is Japanese.');
    // 两段都计为已处理：继续翻译不再调用模型
    model.reset();
    await service.continueTranslation();
    expect(model.seen).toHaveLength(1);
  });

  it('繁中目标下只有简中译文的简体原文仍被送去转换，不因同为中文被跳过', async () => {
    const { service } = await setup('zh-TW', [
      {
        id: '11111111',
        text: '这是简体中文的句子。',
        translations: [
          { id: 'cn', translation: '这是简体中文的句子。', language: 'zh-CN', aiModelId: '' },
        ],
        selectedTranslationId: 'cn',
        selectedTranslations: {
          'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
        },
      },
    ]);
    const model = scriptModel(() => '這是簡體中文的句子。');
    await service.continueTranslation();
    expect(model.seen).toEqual([['11111111']]);
    const [paragraph] = await saved();
    expect(getLanguageTranslation(paragraph!, 'zh-TW')?.translation).toBe('這是簡體中文的句子。');
    // 简中版本与选用保持不变
    expect(getLanguageTranslation(paragraph!, 'zh-CN')?.translation).toBe('这是简体中文的句子。');
  });

  it('简中目标下的繁体原文同样送去转换，原样繁体不会被视为已有简中译文', async () => {
    const { service } = await setup('zh-CN', [
      { id: '11111111', text: '這是繁體中文。', translations: [], selectedTranslationId: '' },
    ]);
    const model = scriptModel(() => '这是繁体中文。');
    await service.continueTranslation();
    expect(model.seen).toEqual([['11111111']]);
    expect(getLanguageTranslation((await saved())[0]!, 'zh-CN')?.translation).toBe(
      '这是繁体中文。',
    );
  });

  it('混合语言段落保存模型返回的整段译文，已是目标语言的部分不被工具改写', async () => {
    const { service } = await setup('en-US', [
      {
        id: '11111111',
        text: 'Chapter 3: 彼は走った。',
        translations: [],
        selectedTranslationId: '',
      },
    ]);
    scriptModel(() => 'Chapter 3: He ran.');
    await service.translateAllParagraphs();
    expect(getLanguageTranslation((await saved())[0]!, 'en-US')?.translation).toBe(
      'Chapter 3: He ran.',
    );
  });
});
