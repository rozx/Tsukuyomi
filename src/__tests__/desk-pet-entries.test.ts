import { describe, expect, it } from 'vitest';
import { createAppI18n } from 'src/i18n/vue';
import { formatThinkingMessage, buildStreamModeMarker } from 'src/composables/useThinkingFormatter';
import {
  buildDeskPetEntries,
  deskPetToolLine,
  tailLine,
  visibleEntries,
} from 'src/composables/desk-pet/desk-pet-entries';

const zh = createAppI18n('zh-CN').global;
const en = createAppI18n('en-US').global;
const toolLine = (tool: string) => deskPetToolLine(zh, tool);

describe('deskPetToolLine：工具台词', () => {
  it('常用工具按用途给出月詠口吻的说明', () => {
    expect(deskPetToolLine(zh, 'search_memories')).toContain('记忆');
    expect(deskPetToolLine(zh, 'query_chapter')).toContain('章节');
    expect(deskPetToolLine(zh, 'add_translation_batch')).toContain('译文');
  });

  it('未收录的工具用通用说明并带工具名', () => {
    expect(deskPetToolLine(zh, 'mystery_tool')).toContain('mystery_tool');
  });

  it('英文界面用中性表达', () => {
    expect(deskPetToolLine(en, 'search_memories')).toBe('Searching memories…');
    expect(deskPetToolLine(en, 'mystery_tool')).toBe('Using mystery_tool…');
  });
});

describe('tailLine：流式文字的末尾', () => {
  it('取最后一个非空行并去掉 Markdown 标记', () => {
    expect(tailLine('第一行\n\n## **第二行**\n')).toBe('第二行');
  });

  it('超长时保留结尾', () => {
    const line = 'a'.repeat(200);
    const tail = tailLine(line);
    expect(tail.startsWith('…')).toBe(true);
    expect(tail.length).toBeLessThan(100);
    expect(tail.endsWith('a')).toBe(true);
  });
});

describe('buildDeskPetEntries：片段 → 思考 / 工具 / 输出', () => {
  const message = [
    '先看看前文的称呼',
    '\n[调用工具: search_memories]\n',
    '[工具结果: {"success":true,"count":3}]\n',
    '记忆里写的是「守望者大人」',
    '\n[状态切换: planning → working]\n',
    buildStreamModeMarker('output'),
    '第 13 段：月光静静地照着沉睡的街道',
  ].join('');
  const parts = formatThinkingMessage(message, 'processing');

  it('依次得到思考、工具、思考、输出，状态切换不成条', () => {
    const entries = buildDeskPetEntries(parts, { toolLine });
    expect(entries.map((entry) => entry.kind)).toEqual(['thinking', 'tool', 'thinking', 'output']);
    expect(entries[0]!.text).toBe('先看看前文的称呼');
    expect(entries[3]!.text).toBe('第 13 段：月光静静地照着沉睡的街道');
  });

  it('工具条目带台词、原始工具名与结果状态', () => {
    const tool = buildDeskPetEntries(parts, { toolLine })[1]!;
    expect(tool.text).toContain('记忆');
    expect(tool.tool).toBe('search_memories');
    expect(tool.toolStatus).toBe('success');
  });

  it('没有解析片段时用 outputContent 作为输出', () => {
    expect(buildDeskPetEntries([], { toolLine, outputContent: '妙！这里是双关' })).toEqual([
      { kind: 'output', text: '妙！这里是双关' },
    ]);
  });

  it('收起只取最后一条，展开取最近 8 条', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      kind: 'thinking' as const,
      text: String(index),
    }));
    expect(visibleEntries(many, false).map((entry) => entry.text)).toEqual(['11']);
    expect(visibleEntries(many, true).map((entry) => entry.text)).toEqual([
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
    ]);
  });
});
