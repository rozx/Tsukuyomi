import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chapter, Novel, Volume } from 'src/models/novel';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { agentMcpLibraryTools } from 'src/services/agent-mcp/tools/library';
import { bookTools } from 'src/services/ai/tools/book-tools';
import { ToolRegistry } from 'src/services/ai/tools/tool-registry';
import { describeTool } from 'src/services/ai/tools/tool-localization';
import { captureExecutionLanguages } from 'src/services/ai/tasks/utils/execution-languages';
import type { ActionInfo } from 'src/services/ai/tools/types';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useSettingsStore } from 'src/stores/settings';

const BOOK_ID = 'book-move-tools-1';

function chapter(id: string): Chapter {
  const now = new Date(0);
  return {
    id,
    title: { original: `${id}話`, translation: { id: `t-${id}`, translation: '', aiModelId: '' } },
    content: [{ id: `p-${id}`, text: id, selectedTranslationId: '', translations: [] }],
    contentLoaded: true,
    createdAt: now,
    lastEdited: now,
  };
}
function volume(id: string, chapterIds: string[]): Volume {
  return {
    id,
    title: { original: id, translation: { id: `t-${id}`, translation: '', aiModelId: '' } },
    chapters: chapterIds.map(chapter),
  };
}
function createBook(): Novel {
  const now = new Date(0);
  return {
    id: BOOK_ID,
    title: '排序工具测试书',
    targetLanguage: 'zh-CN',
    volumes: [volume('v1', ['a', 'b', 'c']), volume('v2', ['d', 'e'])],
    createdAt: now,
    lastEdited: now,
  };
}
const layout = () =>
  (useBooksStore().getBookById(BOOK_ID)?.volumes ?? []).map((vol) => [
    vol.id,
    (vol.chapters ?? []).map((ch) => ch.id),
  ]);

describe('move_chapters：站内工具与外部工具', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'translate_and_edit' });
    await useBooksStore().loadBooks();
    useContextStore().setCurrentBook(null);
    await useBooksStore().addBook(createBook());
    await useBooksStore().refreshBookFromStorage(BOOK_ID);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('外部工具', () => {
    it('调整顺序、移到另一卷并返回各章的新位置', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpLibraryTools });
      const res = await kernel.callTool(
        'move_chapters',
        { book_id: BOOK_ID, chapter_ids: ['c', 'a'], before_chapter_id: 'e' },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError).toBe(false);
      expect(res.data).toMatchObject({
        book_id: BOOK_ID,
        target_volume_id: 'v2',
        created_volume: false,
        unchanged: false,
        moved: [
          {
            chapter_id: 'c',
            title_original: 'c話',
            from_volume_id: 'v1',
            to_volume_id: 'v2',
            index: 1,
          },
          {
            chapter_id: 'a',
            title_original: 'a話',
            from_volume_id: 'v1',
            to_volume_id: 'v2',
            index: 2,
          },
        ],
      });
      expect(layout()).toEqual([
        ['v1', ['b']],
        ['v2', ['d', 'c', 'a', 'e']],
      ]);
    });

    it('可以新建一卷；参数有问题时返回对应的错误码且不改动', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpLibraryTools });
      const created = await kernel.callTool(
        'move_chapters',
        { book_id: BOOK_ID, chapter_ids: ['e'], new_volume_title: '外传' },
        { channel: 'desktop-mcp' },
      );
      expect(created.data).toMatchObject({ created_volume: true });
      expect(layout()[2]?.[1]).toEqual(['e']);

      const before = layout();
      for (const [args, code] of [
        [{ chapter_ids: [] }, 'CHAPTER_IDS_REQUIRED'],
        [{ chapter_ids: ['zzz'] }, 'CHAPTER_NOT_FOUND'],
        [{ chapter_ids: ['a'], target_volume_id: 'nope' }, 'VOLUME_NOT_FOUND'],
        [{ chapter_ids: ['a'], before_chapter_id: 'a' }, 'ANCHOR_IS_MOVED'],
        [{ chapter_ids: ['a', 'd'] }, 'TARGET_REQUIRED'],
      ] as const) {
        const res = await kernel.callTool(
          'move_chapters',
          { book_id: BOOK_ID, ...args },
          { channel: 'desktop-mcp' },
        );
        expect(res.isError).toBe(true);
        expect(res.errorCode).toBe(code);
      }
      expect(layout()).toEqual(before);
    });

    it('只读权限下不可用；说明与参数说明取自站内同名工具', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpLibraryTools });
      const tool = agentMcpLibraryTools.find((entry) => entry.name === 'move_chapters')!;
      expect(tool.description).toContain(describeTool('move_chapters', 'external'));
      const props = tool.inputSchema.properties as Record<string, { description?: string }>;
      for (const name of [
        'chapter_ids',
        'target_volume_id',
        'new_volume_title',
        'before_chapter_id',
        'after_chapter_id',
        'position',
      ]) {
        expect(props[name]?.description).toBe(
          describeTool(`move_chapters.parameters.properties.${name}`),
        );
      }

      await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'read_only' });
      const denied = await kernel.callTool(
        'move_chapters',
        { book_id: BOOK_ID, chapter_ids: ['a'] },
        { channel: 'desktop-mcp' },
      );
      expect(denied.errorCode).toBe('PERMISSION_DENIED');
    });
  });

  describe('站内工具', () => {
    const tool = bookTools.find((entry) => entry.definition.function.name === 'move_chapters')!;
    const invoke = async (args: Record<string, unknown>, onAction?: (action: ActionInfo) => void) =>
      JSON.parse(
        await tool.handler(args, {
          bookId: BOOK_ID,
          languages: captureExecutionLanguages('zh-CN'),
          ...(onAction ? { onAction } : {}),
        }),
      ) as Record<string, unknown>;

    it('调整顺序、移到另一卷，并上报操作', async () => {
      const actions: ActionInfo[] = [];
      const result = await invoke({ chapter_ids: ['a'], after_chapter_id: 'c' }, (action) =>
        actions.push(action),
      );
      expect(result).toMatchObject({
        success: true,
        target_volume_id: 'v1',
        moved: [{ chapter_id: 'a', from_volume_id: 'v1', to_volume_id: 'v1', index: 2 }],
      });
      expect(layout()[0]).toEqual(['v1', ['b', 'c', 'a']]);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ type: 'update', entity: 'chapter' });

      const toOther = await invoke({
        chapter_ids: ['b'],
        target_volume_id: 'v2',
        position: 'start',
      });
      expect(toOther.success).toBe(true);
      expect(layout()).toEqual([
        ['v1', ['c', 'a']],
        ['v2', ['b', 'd', 'e']],
      ]);
    });

    it('位置没变时如实说明；参数有问题时返回错误码', async () => {
      const same = await invoke({ chapter_ids: ['c'], after_chapter_id: 'b' });
      expect(same).toMatchObject({ success: true, unchanged: true });

      const missing = await invoke({ chapter_ids: ['zzz'] });
      expect(missing).toMatchObject({ success: false, error_code: 'CHAPTER_NOT_FOUND' });
      const conflict = await invoke({
        chapter_ids: ['a'],
        before_chapter_id: 'b',
        after_chapter_id: 'c',
      });
      expect(conflict).toMatchObject({ success: false, error_code: 'TARGET_CONFLICT' });
      expect(layout()[0]).toEqual(['v1', ['a', 'b', 'c']]);
    });

    it('聊天助手可以使用，翻译任务里不提供（避免翻译途中改动目录）', () => {
      const names = (tools: Array<{ function: { name: string } }>) =>
        tools.map((entry) => entry.function.name);
      expect(
        names(ToolRegistry.getAssistantToolsExcludingTranslationManagement(BOOK_ID)),
      ).toContain('move_chapters');
      expect(names(ToolRegistry.getTranslationTools(BOOK_ID, undefined))).not.toContain(
        'move_chapters',
      );
    });
  });
});
