import './setup';
import { describe, expect, it } from 'bun:test';
import {
  buildWebFields,
  buildTranslationFields,
  buildBatchReplaceFields,
  buildReadFields,
  buildSearchFields,
  buildMemoryFields,
  buildTodoFields,
  buildNavigateFields,
  buildHelpDocNavigateFields,
  buildAskUserFields,
  buildChapterUpdateFields,
  extractActionName,
} from 'src/utils/action-info/action-field-builders';
import type { ActionInfo } from 'src/services/ai/tools/types';

function makeAction(over: { type?: string; entity?: string; data: unknown }): ActionInfo {
  return {
    type: over.type ?? 'read',
    entity: over.entity ?? 'chapter',
    data: over.data,
  } as unknown as ActionInfo;
}

describe('buildWebFields', () => {
  it('web_search + query 透传 query', () => {
    const result = buildWebFields(
      makeAction({ type: 'web_search', entity: 'web', data: { query: 'hi' } }),
    );
    expect(result).toEqual({ query: 'hi' });
  });

  it('web_fetch + url 透传 url', () => {
    const result = buildWebFields(
      makeAction({ type: 'web_fetch', entity: 'web', data: { url: 'http://x' } }),
    );
    expect(result).toEqual({ url: 'http://x' });
  });

  it('非网络类型或字段缺失时返回空对象', () => {
    expect(
      buildWebFields(makeAction({ type: 'read', entity: 'chapter', data: { query: 'x' } })),
    ).toEqual({});
    expect(
      buildWebFields(makeAction({ type: 'web_search', entity: 'web', data: {} })),
    ).toEqual({});
  });
});

describe('buildTranslationFields', () => {
  it('非 translation 实体返回空对象', () => {
    expect(
      buildTranslationFields(
        makeAction({ type: 'update', entity: 'chapter', data: { paragraph_id: 'p' } }),
      ),
    ).toEqual({});
  });

  it('缺 paragraph_id / translation_id 时返回空对象', () => {
    expect(
      buildTranslationFields(
        makeAction({ type: 'update', entity: 'translation', data: { paragraph_id: 'p' } }),
      ),
    ).toEqual({});
    expect(
      buildTranslationFields(
        makeAction({ type: 'update', entity: 'translation', data: {} }),
      ),
    ).toEqual({});
  });

  it('齐备字段时返回全部四个字段', () => {
    const result = buildTranslationFields(
      makeAction({
        type: 'update',
        entity: 'translation',
        data: {
          paragraph_id: 'p',
          translation_id: 't',
          old_translation: 'old',
          new_translation: 'new',
        },
      }),
    );
    expect(result).toEqual({
      paragraph_id: 'p',
      translation_id: 't',
      old_translation: 'old',
      new_translation: 'new',
    });
  });

  it('old/new_translation 为空字符串时不写入', () => {
    const result = buildTranslationFields(
      makeAction({
        type: 'update',
        entity: 'translation',
        data: {
          paragraph_id: 'p',
          translation_id: 't',
          old_translation: '',
          new_translation: '',
        },
      }),
    );
    expect(result).toEqual({ paragraph_id: 'p', translation_id: 't' });
  });
});

describe('buildBatchReplaceFields', () => {
  it('非 translation 实体返回空对象', () => {
    expect(
      buildBatchReplaceFields(
        makeAction({ type: 'update', entity: 'chapter', data: { tool_name: 'batch_replace_translations' } }),
      ),
    ).toEqual({});
  });

  it('tool_name 不匹配时返回空对象', () => {
    expect(
      buildBatchReplaceFields(
        makeAction({ type: 'update', entity: 'translation', data: { tool_name: 'other' } }),
      ),
    ).toEqual({});
  });

  it('齐备字段时全部写入', () => {
    const result = buildBatchReplaceFields(
      makeAction({
        type: 'update',
        entity: 'translation',
        data: {
          tool_name: 'batch_replace_translations',
          replaced_paragraph_count: 3,
          replaced_translation_count: 5,
          replacement_text: '替换',
          replace_all_translations: true,
          keywords: ['k'],
          original_keywords: ['o'],
        },
      }),
    );
    expect(result).toEqual({
      tool_name: 'batch_replace_translations',
      replaced_paragraph_count: 3,
      replaced_translation_count: 5,
      replacement_text: '替换',
      replace_all_translations: true,
      keywords: ['k'],
      original_keywords: ['o'],
    });
  });

  it('零值字段（count=0、replace_all_translations=false）仍写入（只检查 !== undefined）', () => {
    const result = buildBatchReplaceFields(
      makeAction({
        type: 'update',
        entity: 'translation',
        data: {
          tool_name: 'batch_replace_translations',
          replaced_paragraph_count: 0,
          replaced_translation_count: 0,
          replace_all_translations: false,
        },
      }),
    );
    expect(result.replaced_paragraph_count).toBe(0);
    expect(result.replaced_translation_count).toBe(0);
    expect(result.replace_all_translations).toBe(false);
  });

  it('仅 tool_name 匹配时只返回 tool_name 字段', () => {
    const result = buildBatchReplaceFields(
      makeAction({
        type: 'update',
        entity: 'translation',
        data: { tool_name: 'batch_replace_translations' },
      }),
    );
    expect(result).toEqual({ tool_name: 'batch_replace_translations' });
  });
});

describe('buildReadFields', () => {
  it('非 read 类型返回空对象', () => {
    expect(
      buildReadFields(makeAction({ type: 'update', entity: 'chapter', data: { chapter_id: 'c' } })),
    ).toEqual({});
  });

  it('透传已定义、非空字段', () => {
    const result = buildReadFields(
      makeAction({
        type: 'read',
        entity: 'chapter',
        data: {
          chapter_id: 'c',
          chapter_title: '标题',
          paragraph_id: 'p',
          character_name: '',
          tool_name: null,
          book_id: 'b',
          keywords: ['k'],
          regex_pattern: '/x/',
        },
      }),
    );
    expect(result).toEqual({
      chapter_id: 'c',
      chapter_title: '标题',
      paragraph_id: 'p',
      book_id: 'b',
      keywords: ['k'],
      regex_pattern: '/x/',
    });
  });
});

describe('buildSearchFields', () => {
  it('非 search 类型返回空对象', () => {
    expect(
      buildSearchFields(makeAction({ type: 'read', entity: 'chapter', data: { query: 'x' } })),
    ).toEqual({});
  });

  it('透传 tool_name / keywords / book_id / query', () => {
    const result = buildSearchFields(
      makeAction({
        type: 'search',
        entity: 'chapter',
        data: { tool_name: 't', keywords: ['k'], book_id: 'b', query: 'q', extra: 'e' },
      }),
    );
    expect(result).toEqual({ tool_name: 't', keywords: ['k'], book_id: 'b', query: 'q' });
  });
});

describe('buildMemoryFields', () => {
  it('非 memory 实体返回空对象', () => {
    expect(
      buildMemoryFields(makeAction({ type: 'read', entity: 'chapter', data: {} })),
    ).toEqual({});
  });

  it('memory_id / keyword / summary 均映射', () => {
    const result = buildMemoryFields(
      makeAction({
        type: 'read',
        entity: 'memory',
        data: { memory_id: 'm', keyword: 'k', summary: '摘要' },
      }),
    );
    expect(result).toEqual({ memory_id: 'm', keyword: 'k', name: '摘要' });
  });
});

describe('buildTodoFields', () => {
  it('非 todo 实体返回空对象', () => {
    expect(
      buildTodoFields(makeAction({ type: 'read', entity: 'chapter', data: { text: 'x' } })),
    ).toEqual({});
  });

  it('todo + text 映射为 name', () => {
    const result = buildTodoFields(
      makeAction({ type: 'read', entity: 'todo', data: { text: '买菜' } }),
    );
    expect(result).toEqual({ name: '买菜' });
  });

  it('todo 但无 text 时返回空对象', () => {
    expect(
      buildTodoFields(makeAction({ type: 'read', entity: 'todo', data: {} })),
    ).toEqual({});
  });
});

describe('buildNavigateFields', () => {
  it('非 navigate 类型返回空对象', () => {
    expect(
      buildNavigateFields(makeAction({ type: 'read', entity: 'chapter', data: { book_id: 'b' } })),
    ).toEqual({});
  });

  it('透传已定义字段', () => {
    const result = buildNavigateFields(
      makeAction({
        type: 'navigate',
        entity: 'chapter',
        data: { book_id: 'b', chapter_id: 'c', chapter_title: 't', paragraph_id: 'p' },
      }),
    );
    expect(result).toEqual({
      book_id: 'b',
      chapter_id: 'c',
      chapter_title: 't',
      paragraph_id: 'p',
    });
  });
});

describe('buildHelpDocNavigateFields', () => {
  it('非 navigate 或非 help_doc 时返回空对象', () => {
    expect(
      buildHelpDocNavigateFields(
        makeAction({ type: 'read', entity: 'help_doc', data: { doc_id: 'd' } }),
      ),
    ).toEqual({});
    expect(
      buildHelpDocNavigateFields(
        makeAction({ type: 'navigate', entity: 'chapter', data: { doc_id: 'd' } }),
      ),
    ).toEqual({});
  });

  it('缺 doc_id 时返回空对象', () => {
    expect(
      buildHelpDocNavigateFields(
        makeAction({ type: 'navigate', entity: 'help_doc', data: {} }),
      ),
    ).toEqual({});
  });

  it('齐备字段透传 doc_id / doc_title -> title / section_id', () => {
    const result = buildHelpDocNavigateFields(
      makeAction({
        type: 'navigate',
        entity: 'help_doc',
        data: { doc_id: 'd', doc_title: 'T', section_id: 's' },
      }),
    );
    expect(result).toEqual({ doc_id: 'd', title: 'T', section_id: 's' });
  });

  it('仅 doc_id 时不写入 title / section_id', () => {
    const result = buildHelpDocNavigateFields(
      makeAction({ type: 'navigate', entity: 'help_doc', data: { doc_id: 'd' } }),
    );
    expect(result).toEqual({ doc_id: 'd' });
  });
});

describe('buildAskUserFields', () => {
  it('非 ask / 非 user 实体返回空对象', () => {
    expect(
      buildAskUserFields(makeAction({ type: 'read', entity: 'user', data: {} })),
    ).toEqual({});
    expect(
      buildAskUserFields(makeAction({ type: 'ask', entity: 'chapter', data: {} })),
    ).toEqual({});
  });

  it('ask_user 齐备时输出 tool_name + question + 回答信息', () => {
    const result = buildAskUserFields(
      makeAction({
        type: 'ask',
        entity: 'user',
        data: {
          tool_name: 'ask_user',
          question: 'Q?',
          answer: 'A',
          selected_index: 2,
          cancelled: true,
          suggested_answers: ['x', 'y'],
        },
      }),
    );
    expect(result).toEqual({
      tool_name: 'ask_user',
      question: 'Q?',
      answer: 'A',
      selected_index: 2,
      cancelled: true,
      suggested_answers: ['x', 'y'],
    });
  });

  it('ask_user 缺 question 时返回空对象', () => {
    expect(
      buildAskUserFields(
        makeAction({ type: 'ask', entity: 'user', data: { tool_name: 'ask_user' } }),
      ),
    ).toEqual({});
  });

  it('ask_user 可选字段缺失时不写入', () => {
    const result = buildAskUserFields(
      makeAction({
        type: 'ask',
        entity: 'user',
        data: { tool_name: 'ask_user', question: 'Q?' },
      }),
    );
    expect(result).toEqual({ tool_name: 'ask_user', question: 'Q?' });
  });

  it('ask_user_batch 齐备时输出 tool_name + questions + answers', () => {
    const answers = [{ question_index: 0, answer: 'A' }];
    const result = buildAskUserFields(
      makeAction({
        type: 'ask',
        entity: 'user',
        data: {
          tool_name: 'ask_user_batch',
          questions: ['Q1'],
          answers,
          cancelled: true,
        },
      }),
    );
    expect(result.tool_name).toBe('ask_user_batch');
    expect(result.batch_questions).toEqual(['Q1']);
    expect(result.batch_answers).toEqual(answers);
    expect(result.cancelled).toBe(true);
  });

  it('ask_user_batch 缺 questions 或 answers 时返回空对象', () => {
    expect(
      buildAskUserFields(
        makeAction({
          type: 'ask',
          entity: 'user',
          data: { tool_name: 'ask_user_batch', questions: ['Q1'] },
        }),
      ),
    ).toEqual({});
    expect(
      buildAskUserFields(
        makeAction({
          type: 'ask',
          entity: 'user',
          data: { tool_name: 'ask_user_batch', answers: [] },
        }),
      ),
    ).toEqual({});
  });

  it('未知 tool_name 返回空对象', () => {
    expect(
      buildAskUserFields(
        makeAction({
          type: 'ask',
          entity: 'user',
          data: { tool_name: 'unknown', question: 'Q' },
        }),
      ),
    ).toEqual({});
  });
});

describe('buildChapterUpdateFields', () => {
  it('非 update chapter 返回空对象', () => {
    expect(
      buildChapterUpdateFields(
        makeAction({ type: 'read', entity: 'chapter', data: { old_title: 'a' } }),
      ),
    ).toEqual({});
    expect(
      buildChapterUpdateFields(
        makeAction({ type: 'update', entity: 'book', data: { old_title: 'a' } }),
      ),
    ).toEqual({});
  });

  it('齐备字段时输出 old/new_title 和 tool_name', () => {
    const result = buildChapterUpdateFields(
      makeAction({
        type: 'update',
        entity: 'chapter',
        data: { old_title: 'A', new_title: 'B', tool_name: 'update_chapter_title' },
      }),
    );
    expect(result).toEqual({
      old_title: 'A',
      new_title: 'B',
      tool_name: 'update_chapter_title',
    });
  });
});

describe('extractActionName', () => {
  it('有 name 时返回 name 值', () => {
    expect(extractActionName({ name: 'x' } as unknown as ActionInfo['data'])).toBe('x');
  });

  it('无 name 时返回 undefined', () => {
    expect(extractActionName({} as unknown as ActionInfo['data'])).toBeUndefined();
  });
});
