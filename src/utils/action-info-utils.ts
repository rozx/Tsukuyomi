import type { ActionInfo } from 'src/services/ai/tools/types';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { TodoItem } from 'src/services/todo-list-service';
import type { Novel } from 'src/models/novel';
import { ChapterService } from 'src/services/chapter-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';

/**
 * 操作类型标签映射
 */
export const ACTION_LABELS: Record<MessageAction['type'], string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  web_search: '网络搜索',
  web_fetch: '网页获取',
  read: '读取',
  navigate: '导航',
  ask: '提问',
  search: '搜索',
};

/**
 * 实体类型标签映射
 */
export const ENTITY_LABELS: Record<MessageAction['entity'], string> = {
  term: '术语',
  character: '角色',
  web: '网络',
  translation: '翻译',
  chapter: '章节',
  paragraph: '段落',
  book: '书籍',
  memory: '记忆',
  todo: '待办事项',
  user: '用户',
  help_doc: '帮助文档',
};

/**
 * 操作详情项接口
 */
export interface ActionDetail {
  label: string;
  value: string;
}

/**
 * 操作详情上下文接口（用于获取相关数据）
 */
export interface ActionDetailsContext {
  /** 获取书籍的函数 */
  getBookById: (bookId: string) => Novel | undefined;
  /** 获取当前书籍 ID 的函数 */
  getCurrentBookId: () => string | null;
}

/**
 * 将 ActionInfo 转换为 MessageAction
 * 统一处理所有操作类型的字段映射
 */
export function createMessageActionFromActionInfo(action: ActionInfo): MessageAction {
  const actionName = 'name' in action.data ? action.data.name : undefined;
  return {
    type: action.type,
    entity: action.entity,
    ...(actionName ? { name: actionName } : {}),
    timestamp: Date.now(),
    // 网络操作相关信息
    ...(action.type === 'web_search' && 'query' in action.data ? { query: action.data.query } : {}),
    ...(action.type === 'web_fetch' && 'url' in action.data ? { url: action.data.url } : {}),
    // 翻译操作相关信息
    ...(action.entity === 'translation' &&
    'paragraph_id' in action.data &&
    'translation_id' in action.data
      ? {
          paragraph_id: action.data.paragraph_id,
          translation_id: action.data.translation_id,
          ...('old_translation' in action.data && action.data.old_translation
            ? { old_translation: action.data.old_translation }
            : {}),
          ...('new_translation' in action.data && action.data.new_translation
            ? { new_translation: action.data.new_translation }
            : {}),
        }
      : {}),
    // 批量替换相关信息
    ...(action.entity === 'translation' &&
    'tool_name' in action.data &&
    action.data.tool_name === 'batch_replace_translations'
      ? {
          tool_name: action.data.tool_name,
          ...('replaced_paragraph_count' in action.data &&
          action.data.replaced_paragraph_count !== undefined
            ? { replaced_paragraph_count: action.data.replaced_paragraph_count }
            : {}),
          ...('replaced_translation_count' in action.data &&
          action.data.replaced_translation_count !== undefined
            ? { replaced_translation_count: action.data.replaced_translation_count }
            : {}),
          ...('replacement_text' in action.data && action.data.replacement_text
            ? { replacement_text: action.data.replacement_text }
            : {}),
          ...('replace_all_translations' in action.data &&
          action.data.replace_all_translations !== undefined
            ? { replace_all_translations: action.data.replace_all_translations }
            : {}),
          ...('keywords' in action.data && action.data.keywords
            ? { keywords: action.data.keywords }
            : {}),
          ...('original_keywords' in action.data && action.data.original_keywords
            ? { original_keywords: action.data.original_keywords }
            : {}),
        }
      : {}),
    // 读取操作相关信息
    ...(action.type === 'read' && 'chapter_id' in action.data
      ? { chapter_id: action.data.chapter_id }
      : {}),
    ...(action.type === 'read' && 'chapter_title' in action.data
      ? { chapter_title: action.data.chapter_title }
      : {}),
    ...(action.type === 'read' && 'paragraph_id' in action.data
      ? { paragraph_id: action.data.paragraph_id }
      : {}),
    ...(action.type === 'read' && 'character_name' in action.data
      ? { character_name: action.data.character_name }
      : {}),
    ...(action.type === 'read' && 'tool_name' in action.data
      ? { tool_name: action.data.tool_name }
      : {}),
    ...(action.type === 'read' && 'title' in action.data ? { title: action.data.title } : {}),
    ...(action.type === 'read' && 'url' in action.data ? { url: action.data.url } : {}),
    ...(action.type === 'read' && 'book_id' in action.data ? { book_id: action.data.book_id } : {}),
    ...(action.type === 'read' && 'keywords' in action.data
      ? { keywords: action.data.keywords }
      : {}),
    ...(action.type === 'read' && 'translation_keywords' in action.data
      ? { translation_keywords: action.data.translation_keywords }
      : {}),
    ...(action.type === 'read' && 'regex_pattern' in action.data
      ? { regex_pattern: action.data.regex_pattern }
      : {}),
    // 搜索操作相关信息
    ...(action.type === 'search' && 'tool_name' in action.data
      ? { tool_name: action.data.tool_name }
      : {}),
    ...(action.type === 'search' && 'keywords' in action.data
      ? { keywords: action.data.keywords }
      : {}),
    ...(action.type === 'search' && 'book_id' in action.data
      ? { book_id: action.data.book_id }
      : {}),
    ...(action.type === 'search' && 'query' in action.data ? { query: action.data.query } : {}),
    // Memory 相关信息
    ...(action.entity === 'memory' && 'memory_id' in action.data
      ? { memory_id: action.data.memory_id }
      : {}),
    ...(action.entity === 'memory' && 'keyword' in action.data
      ? { keyword: action.data.keyword }
      : {}),
    ...(action.entity === 'memory' && 'summary' in action.data
      ? { name: action.data.summary }
      : {}),
    // 待办事项操作相关信息
    ...(action.entity === 'todo' && 'text' in action.data
      ? { name: (action.data as TodoItem).text }
      : {}),
    // 导航操作相关信息
    ...(action.type === 'navigate' && 'book_id' in action.data
      ? { book_id: action.data.book_id }
      : {}),
    ...(action.type === 'navigate' && 'chapter_id' in action.data
      ? { chapter_id: action.data.chapter_id }
      : {}),
    ...(action.type === 'navigate' && 'chapter_title' in action.data
      ? { chapter_title: action.data.chapter_title }
      : {}),
    ...(action.type === 'navigate' && 'paragraph_id' in action.data
      ? { paragraph_id: action.data.paragraph_id }
      : {}),
    // ask_user / ask_user_batch 问答相关信息
    ...(action.type === 'ask' &&
    action.entity === 'user' &&
    'tool_name' in action.data &&
    action.data.tool_name === 'ask_user' &&
    'question' in action.data
      ? {
          tool_name: 'ask_user',
          question: action.data.question,
          ...('answer' in action.data && typeof action.data.answer === 'string'
            ? { answer: action.data.answer }
            : {}),
          ...('selected_index' in action.data && typeof action.data.selected_index === 'number'
            ? { selected_index: action.data.selected_index }
            : {}),
          ...('cancelled' in action.data && action.data.cancelled ? { cancelled: true } : {}),
          ...('suggested_answers' in action.data && Array.isArray(action.data.suggested_answers)
            ? { suggested_answers: action.data.suggested_answers }
            : {}),
        }
      : {}),
    ...(action.type === 'ask' &&
    action.entity === 'user' &&
    'tool_name' in action.data &&
    action.data.tool_name === 'ask_user_batch' &&
    'questions' in action.data &&
    'answers' in action.data
      ? {
          tool_name: 'ask_user_batch',
          batch_questions: action.data.questions,
          batch_answers: action.data.answers,
          ...('cancelled' in action.data && action.data.cancelled ? { cancelled: true } : {}),
        }
      : {}),
    // 章节更新相关信息
    ...(action.type === 'update' && action.entity === 'chapter' && 'old_title' in action.data
      ? { old_title: action.data.old_title }
      : {}),
    ...(action.type === 'update' && action.entity === 'chapter' && 'new_title' in action.data
      ? { new_title: action.data.new_title }
      : {}),
    ...(action.type === 'update' && action.entity === 'chapter' && 'tool_name' in action.data
      ? { tool_name: action.data.tool_name }
      : {}),
  };
}

/**
 * 获取操作详细信息（用于 popover 显示）
 */
export function getActionDetails(
  action: MessageAction,
  context: ActionDetailsContext,
): ActionDetail[] {
  const details: ActionDetail[] = [
    {
      label: '操作类型',
      value: ACTION_LABELS[action.type],
    },
    {
      label: '实体类型',
      value: ENTITY_LABELS[action.entity],
    },
  ];

  if (action.name) {
    details.push({
      label: '名称',
      value: action.name,
    });
  }

  // 批量问答详情
  if (action.type === 'ask' && action.entity === 'user' && action.tool_name === 'ask_user_batch') {
    const questions = action.batch_questions ?? [];
    const answers = action.batch_answers ?? [];
    details.push({
      label: '问题数量',
      value: `${questions.length} 题`,
    });
    for (const ans of answers) {
      const q = questions[ans.question_index] ?? `#${ans.question_index + 1}`;
      const aPreview = ans.answer.length > 120 ? ans.answer.substring(0, 120) + '...' : ans.answer;
      details.push({
        label: `第 ${ans.question_index + 1} 题`,
        value: `${q} → ${aPreview}`,
      });
    }
  }

  // 尝试从当前书籍获取详细信息
  const currentBookId = context.getCurrentBookId();
  if (currentBookId && action.name) {
    const book = context.getBookById(currentBookId);
    if (book) {
      if (action.entity === 'term') {
        const term = book.terminologies?.find((t) => t.name === action.name);
        if (term) {
          if (term.translation?.translation) {
            details.push({
              label: '翻译',
              value: term.translation.translation,
            });
          }
          if (term.description) {
            details.push({
              label: '描述',
              value: term.description,
            });
          }
        }
      } else if (action.entity === 'character') {
        const character = book.characterSettings?.find((c) => c.name === action.name);
        if (character) {
          if (character.translation?.translation) {
            details.push({
              label: '翻译',
              value: character.translation.translation,
            });
          }
          if (character.sex) {
            const sexLabels: Record<string, string> = {
              male: '男',
              female: '女',
              other: '其他',
            };
            details.push({
              label: '性别',
              value: sexLabels[character.sex] || character.sex,
            });
          }
          if (character.description) {
            details.push({
              label: '描述',
              value: character.description,
            });
          }
          if (character.speakingStyle) {
            details.push({
              label: '说话口吻',
              value: character.speakingStyle,
            });
          }
          if (character.aliases && character.aliases.length > 0) {
            details.push({
              label: '别名',
              value: character.aliases.map((a) => a.name).join('、'),
            });
          }
        }
      }
    }
  }

  // 处理网络搜索操作
  if (action.type === 'web_search' && action.entity === 'web') {
    if (action.query) {
      details.push({
        label: '搜索查询',
        value: action.query,
      });
    }
  }

  // 处理网页获取操作
  if (action.type === 'web_fetch' && action.entity === 'web') {
    if (action.url) {
      details.push({
        label: '网页 URL',
        value: action.url,
      });
    }
  }

  // 处理待办事项操作
  if (action.entity === 'todo') {
    if (action.name) {
      details.push({
        label: '内容',
        value: action.name,
      });
    }
  }

  // 处理翻译操作
  if (action.entity === 'translation') {
    // 批量替换操作
    if (action.tool_name === 'batch_replace_translations') {
      if (action.replaced_paragraph_count !== undefined) {
        details.push({
          label: '替换段落数',
          value: `${action.replaced_paragraph_count} 个`,
        });
      }
      if (action.replaced_translation_count !== undefined) {
        details.push({
          label: '替换翻译版本数',
          value: `${action.replaced_translation_count} 个`,
        });
      }
      if (action.replacement_text) {
        const preview =
          action.replacement_text.length > 50
            ? action.replacement_text.substring(0, 50) + '...'
            : action.replacement_text;
        details.push({
          label: '替换文本',
          value: preview,
        });
      }
      if (action.keywords && action.keywords.length > 0) {
        details.push({
          label: '翻译关键词',
          value: action.keywords.join('、'),
        });
      }
      if (action.original_keywords && action.original_keywords.length > 0) {
        details.push({
          label: '原文关键词',
          value: action.original_keywords.join('、'),
        });
      }
      if (action.replace_all_translations !== undefined) {
        details.push({
          label: '替换所有版本',
          value: action.replace_all_translations ? '是' : '否',
        });
      }
    } else {
      // 单个翻译操作
      if (action.paragraph_id) {
        details.push({
          label: '段落 ID',
          value: action.paragraph_id,
        });
        // 尝试获取段落信息
        const currentBookId = context.getCurrentBookId();
        if (currentBookId) {
          const book = context.getBookById(currentBookId);
          if (book) {
            const location = ChapterService.findParagraphLocation(book, action.paragraph_id);
            if (location) {
              const { paragraph, chapter } = location;
              const chapterTitle = getChapterDisplayTitle(chapter);
              details.push({
                label: '章节',
                value: chapterTitle,
              });
              if (paragraph.text) {
                const preview =
                  paragraph.text.length > 50
                    ? paragraph.text.substring(0, 50) + '...'
                    : paragraph.text;
                details.push({
                  label: '原文预览',
                  value: preview,
                });
              }
              if (action.translation_id) {
                const translation = paragraph.translations?.find(
                  (t) => t.id === action.translation_id,
                );
                if (translation?.translation) {
                  const preview =
                    translation.translation.length > 50
                      ? translation.translation.substring(0, 50) + '...'
                      : translation.translation;
                  details.push({
                    label: '翻译预览',
                    value: preview,
                  });
                }
              }
            }
          }
        }
      }
      if (action.translation_id) {
        details.push({
          label: '翻译 ID',
          value: action.translation_id,
        });
      }
      // 显示旧翻译和新翻译（用于 update_translation）
      if (action.old_translation && action.new_translation) {
        const oldPreview =
          action.old_translation.length > 100
            ? action.old_translation.substring(0, 100) + '...'
            : action.old_translation;
        const newPreview =
          action.new_translation.length > 100
            ? action.new_translation.substring(0, 100) + '...'
            : action.new_translation;
        details.push({
          label: '旧翻译',
          value: oldPreview,
        });
        details.push({
          label: '新翻译',
          value: newPreview,
        });
      }
    }
  }

  // 处理 Memory 操作
  if (action.entity === 'memory') {
    if (action.tool_name === 'search_memory_by_keywords') {
      if (action.keywords && action.keywords.length > 0) {
        details.push({
          label: '搜索关键词',
          value: action.keywords.join('、'),
        });
      }
    } else {
      if (action.memory_id) {
        details.push({
          label: 'Memory ID',
          value: action.memory_id,
        });
      }
      if (action.keyword) {
        details.push({
          label: '搜索关键词',
          value: action.keyword,
        });
      }
      if (action.keywords && action.keywords.length > 0) {
        details.push({
          label: '关键词',
          value: action.keywords.join('、'),
        });
      }
    }
    if (action.name) {
      details.push({
        label: '摘要',
        value: action.name,
      });
    }
  }

  // 处理读取操作
  if (action.type === 'read') {
    if (action.tool_name) {
      details.push({
        label: '工具',
        value: action.tool_name,
      });
    }
    if (action.tool_name === 'get_help_doc' && action.title) {
      details.push({
        label: '文档标题',
        value: action.title,
      });
    }
    if (action.tool_name === 'list_help_docs') {
      details.push({
        label: '文档列表',
        value: '已获取',
      });
    }
    // get_book_info 的特殊处理
    if (action.tool_name === 'get_book_info' && action.book_id) {
      const book = context.getBookById(action.book_id);
      if (book) {
        details.push({
          label: '书籍',
          value: book.title,
        });
        if (book.author) {
          details.push({
            label: '作者',
            value: book.author,
          });
        }
        if (book.description) {
          const preview =
            book.description.length > 100
              ? book.description.substring(0, 100) + '...'
              : book.description;
          details.push({
            label: '简介',
            value: preview,
          });
        }
      }
    }
    // get_memory 的特殊处理
    if (action.tool_name === 'get_memory' && action.memory_id) {
      const currentBookId = context.getCurrentBookId();
      if (currentBookId) {
        // 尝试从 MemoryService 获取 Memory 信息（如果可能）
        // 注意：这里可能需要异步获取，但为了简化，我们只显示 ID
        details.push({
          label: 'Memory ID',
          value: action.memory_id,
        });
      }
    }
    // search_characters_by_keywords 的特殊处理
    if (action.tool_name === 'search_characters_by_keywords') {
      if (action.keywords && action.keywords.length > 0) {
        details.push({
          label: '搜索关键词',
          value: action.keywords.join('、'),
        });
      }
    }
    // search_terms_by_keywords 的特殊处理
    if (action.tool_name === 'search_terms_by_keywords') {
      if (action.keywords && action.keywords.length > 0) {
        details.push({
          label: '搜索关键词',
          value: action.keywords.join('、'),
        });
      }
    }
    // find_paragraph_by_keywords 的特殊处理
    if (action.tool_name === 'find_paragraph_by_keywords') {
      if (action.keywords && action.keywords.length > 0) {
        details.push({
          label: '原文关键词',
          value: action.keywords.join('、'),
        });
      }
      if (action.translation_keywords && action.translation_keywords.length > 0) {
        details.push({
          label: '翻译关键词',
          value: action.translation_keywords.join('、'),
        });
      }
      // 如果提供了章节ID，尝试获取章节标题
      if (action.chapter_id) {
        const currentBookId = context.getCurrentBookId();
        if (currentBookId) {
          const book = context.getBookById(currentBookId);
          if (book) {
            const chapterResult = ChapterService.findChapterById(book, action.chapter_id);
            if (chapterResult && chapterResult.chapter) {
              const chapterTitle = getChapterDisplayTitle(chapterResult.chapter);
              details.push({
                label: '章节',
                value: chapterTitle,
              });
            } else {
              details.push({
                label: '章节 ID',
                value: action.chapter_id,
              });
            }
          } else {
            details.push({
              label: '章节 ID',
              value: action.chapter_id,
            });
          }
        } else {
          details.push({
            label: '章节 ID',
            value: action.chapter_id,
          });
        }
      }
    } else if (action.tool_name === 'search_paragraphs_by_regex') {
      // search_paragraphs_by_regex 的特殊处理
      if (action.regex_pattern) {
        details.push({
          label: '正则表达式',
          value: action.regex_pattern,
        });
      }
      // 如果提供了章节ID，尝试获取章节标题
      if (action.chapter_id) {
        const currentBookId = context.getCurrentBookId();
        if (currentBookId) {
          const book = context.getBookById(currentBookId);
          if (book) {
            const chapterResult = ChapterService.findChapterById(book, action.chapter_id);
            if (chapterResult && chapterResult.chapter) {
              const chapterTitle = getChapterDisplayTitle(chapterResult.chapter);
              details.push({
                label: '章节',
                value: chapterTitle,
              });
            } else {
              details.push({
                label: '章节 ID',
                value: action.chapter_id,
              });
            }
          } else {
            details.push({
              label: '章节 ID',
              value: action.chapter_id,
            });
          }
        } else {
          details.push({
            label: '章节 ID',
            value: action.chapter_id,
          });
        }
      }
    } else if (action.tool_name === 'get_occurrences_by_keywords') {
      // get_occurrences_by_keywords 的特殊处理
      if (action.keywords && action.keywords.length > 0) {
        details.push({
          label: '关键词',
          value: action.keywords.join('、'),
        });
      }
    } else {
      // 其他工具的通用关键词显示
      if (action.keywords && action.keywords.length > 0) {
        details.push({
          label: '关键词',
          value: action.keywords.join('、'),
        });
      }
      if (action.regex_pattern) {
        details.push({
          label: '正则表达式',
          value: action.regex_pattern,
        });
      }
      if (action.chapter_id) {
        const currentBookId = context.getCurrentBookId();
        if (currentBookId) {
          const book = context.getBookById(currentBookId);
          if (book) {
            const chapterResult = ChapterService.findChapterById(book, action.chapter_id);
            if (chapterResult && chapterResult.chapter) {
              const chapterTitle = getChapterDisplayTitle(chapterResult.chapter);
              details.push({
                label: '章节',
                value: chapterTitle,
              });
            } else {
              details.push({
                label: '章节 ID',
                value: action.chapter_id,
              });
            }
          } else {
            details.push({
              label: '章节 ID',
              value: action.chapter_id,
            });
          }
        } else {
          details.push({
            label: '章节 ID',
            value: action.chapter_id,
          });
        }
      }
    }
    if (action.chapter_title) {
      details.push({
        label: '章节标题',
        value: action.chapter_title,
      });
    }
    if (action.paragraph_id) {
      details.push({
        label: '段落 ID',
        value: action.paragraph_id,
      });
      // 对于 get_paragraph_info, get_previous_paragraphs, get_next_paragraphs，尝试获取段落信息
      if (
        action.tool_name === 'get_paragraph_info' ||
        action.tool_name === 'get_previous_paragraphs' ||
        action.tool_name === 'get_next_paragraphs'
      ) {
        const currentBookId = context.getCurrentBookId();
        if (currentBookId) {
          const book = context.getBookById(currentBookId);
          if (book) {
            const location = ChapterService.findParagraphLocation(book, action.paragraph_id);
            if (location) {
              const { paragraph, chapter } = location;
              const chapterTitle = getChapterDisplayTitle(chapter);
              if (!details.some((d) => d.label === '章节')) {
                details.push({
                  label: '章节',
                  value: chapterTitle,
                });
              }
              if (paragraph.text) {
                const preview =
                  paragraph.text.length > 50
                    ? paragraph.text.substring(0, 50) + '...'
                    : paragraph.text;
                details.push({
                  label: '原文预览',
                  value: preview,
                });
              }
            }
          }
        }
      }
    }
    if (action.character_name) {
      details.push({
        label: '角色名称',
        value: action.character_name,
      });
    }
    if (action.name) {
      details.push({
        label: '名称',
        value: action.name,
      });
    }
  }

  // 处理搜索操作
  if (action.type === 'search') {
    if (action.tool_name === 'search_chapter_summaries') {
      if (action.keywords && action.keywords.length > 0) {
        details.push({
          label: '搜索关键词',
          value: action.keywords.join('、'),
        });
      }
    }
    if (action.tool_name === 'search_help_docs') {
      if (action.query) {
        details.push({
          label: '搜索查询',
          value: action.query,
        });
      }
      if (action.name) {
        details.push({
          label: '命中文档',
          value: action.name,
        });
      }
    }
  }

  // 处理章节更新操作
  if (action.type === 'update' && action.entity === 'chapter') {
    if (action.tool_name === 'update_chapter_title') {
      if (action.old_title) {
        details.push({
          label: '旧标题',
          value: action.old_title,
        });
      }
      if (action.new_title) {
        details.push({
          label: '新标题',
          value: action.new_title,
        });
      }
      if (action.chapter_id) {
        const currentBookId = context.getCurrentBookId();
        if (currentBookId) {
          const book = context.getBookById(currentBookId);
          if (book) {
            const chapterResult = ChapterService.findChapterById(book, action.chapter_id);
            if (chapterResult && chapterResult.chapter) {
              const chapterTitle = getChapterDisplayTitle(chapterResult.chapter);
              details.push({
                label: '章节',
                value: chapterTitle,
              });
            } else {
              details.push({
                label: '章节 ID',
                value: action.chapter_id,
              });
            }
          } else {
            details.push({
              label: '章节 ID',
              value: action.chapter_id,
            });
          }
        } else {
          details.push({
            label: '章节 ID',
            value: action.chapter_id,
          });
        }
      }
    }
  }

  // 处理导航操作
  if (action.type === 'navigate') {
    if (action.book_id) {
      const book = context.getBookById(action.book_id);
      if (book) {
        details.push({
          label: '书籍',
          value: book.title,
        });
      } else {
        details.push({
          label: '书籍 ID',
          value: action.book_id,
        });
      }
    }
    if (action.chapter_id) {
      const currentBookId = action.book_id || context.getCurrentBookId();
      if (currentBookId) {
        const book = context.getBookById(currentBookId);
        if (book) {
          const chapterResult = ChapterService.findChapterById(book, action.chapter_id);
          if (chapterResult && chapterResult.chapter) {
            const chapterTitle = getChapterDisplayTitle(chapterResult.chapter);
            details.push({
              label: '章节',
              value: chapterTitle,
            });
          } else {
            details.push({
              label: '章节 ID',
              value: action.chapter_id,
            });
          }
        } else {
          details.push({
            label: '章节 ID',
            value: action.chapter_id,
          });
        }
      } else {
        details.push({
          label: '章节 ID',
          value: action.chapter_id,
        });
      }
    }
    if (action.chapter_title) {
      details.push({
        label: '章节标题',
        value: action.chapter_title,
      });
    }
    if (action.paragraph_id) {
      details.push({
        label: '段落 ID',
        value: action.paragraph_id,
      });
    }
  }

  details.push({
    label: '操作时间',
    value: new Date(action.timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  });

  return details;
}
