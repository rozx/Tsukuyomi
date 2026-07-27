import { describe, expect, it } from 'vitest';
import {
  buildStreamAppendText,
  buildStreamModeMarker,
  formatThinkingMessage,
  inferStreamMode,
  tryIncrementalFormat,
  type FormattedMessagePart,
} from 'src/composables/useThinkingFormatter';

/**
 * 思考过程与输出内容共用同一条时间线：输出通过模式标记写进 thinkingMessage，
 * 解析后 content 片段带 `mode: 'output'`，UI 才能按 thinking → output → tool call → output 顺序渲染。
 */
describe('buildStreamAppendText', () => {
  it('同一模式连续追加不插入标记', () => {
    const result = buildStreamAppendText('thinking', 'thinking', '继续推理');
    expect(result).toBe('继续推理');
  });

  it('模式切换时在文本前插入对应标记', () => {
    const toOutput = buildStreamAppendText('thinking', 'output', '译文第一句');
    expect(toOutput).toBe(`${buildStreamModeMarker('output')}译文第一句`);

    const toThinking = buildStreamAppendText('output', 'thinking', '再想想');
    expect(toThinking).toBe(`${buildStreamModeMarker('thinking')}再想想`);
  });

  it('首次追加输出（无上一模式）也要插入输出标记', () => {
    expect(buildStreamAppendText(undefined, 'output', '译文')).toBe(
      `${buildStreamModeMarker('output')}译文`,
    );
  });

  it('首次追加思考（无上一模式）不需要标记', () => {
    expect(buildStreamAppendText(undefined, 'thinking', '推理')).toBe('推理');
  });
});

describe('inferStreamMode', () => {
  it('空消息与无标记消息都按思考处理', () => {
    expect(inferStreamMode('')).toBe('thinking');
    expect(inferStreamMode(undefined)).toBe('thinking');
    expect(inferStreamMode('一段纯思考')).toBe('thinking');
  });

  it('取最后一个模式标记：停在输出上就是输出', () => {
    const message = `思考${buildStreamModeMarker('output')}译文`;
    expect(inferStreamMode(message)).toBe('output');
  });

  it('取最后一个模式标记：切回思考后就是思考', () => {
    const message = `思考${buildStreamModeMarker('output')}译文${buildStreamModeMarker('thinking')}再想想`;
    expect(inferStreamMode(message)).toBe('thinking');
  });

  it('恢复的历史任务续写思考时能正确插入标记', () => {
    // 场景：任务从 IndexedDB 恢复，内存里没有上一次模式记录，但消息停在输出上
    const restored = `译文${buildStreamModeMarker('output')}最后一句译文`;
    const appended = buildStreamAppendText(inferStreamMode(restored), 'thinking', '继续推理');
    expect(appended).toBe(`${buildStreamModeMarker('thinking')}继续推理`);
  });
});

describe('formatThinkingMessage 模式标记', () => {
  it('按 thinking → output → tool call → output 顺序产出片段', () => {
    const message = [
      '先分析原文语气。',
      buildStreamModeMarker('output'),
      '「……你醒了？」',
      buildStreamModeMarker('thinking'),
      '[调用工具: search_memories]',
      '[工具结果: {"success":true}]',
      buildStreamModeMarker('output'),
      '藤田的声音从很远的地方传来。',
    ].join('');

    const parts = formatThinkingMessage(message, 'processing');
    const shape = parts.map((p) => [p.type, p.mode ?? 'thinking']);

    expect(shape).toEqual([
      ['content', 'thinking'],
      ['content', 'output'],
      ['tool-call', 'thinking'],
      ['tool-result', 'thinking'],
      ['content', 'output'],
    ]);
    expect(parts[1]!.text).toBe('「……你醒了？」');
    expect(parts[4]!.text).toBe('藤田的声音从很远的地方传来。');
  });

  it('模式标记本身不产生 content 片段', () => {
    const parts = formatThinkingMessage(buildStreamModeMarker('output') + '仅有输出');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ type: 'content', text: '仅有输出', mode: 'output' });
  });

  it('思考模式的 content 片段不带 mode 字段（保持既有断言与 v-memo 依赖）', () => {
    const parts = formatThinkingMessage('普通思考');
    expect(parts[0]).toEqual({ type: 'content', text: '普通思考' });
  });
});

describe('tryIncrementalFormat 模式继承', () => {
  it('输出模式下的尾部追加继续归属输出', () => {
    const prevParts: FormattedMessagePart[] = [
      { type: 'content', text: '译文开头', mode: 'output' },
    ];
    const prevLen = 4;
    const result = tryIncrementalFormat(prevParts, prevLen, '译文开头，后半句');

    expect(result).not.toBeNull();
    expect(result![0]).toEqual({ type: 'content', text: '译文开头，后半句', mode: 'output' });
  });

  it('最后一个片段是 tool-call 时，新 content 片段沿用最近一次的模式', () => {
    const prevParts: FormattedMessagePart[] = [
      { type: 'content', text: '译文', mode: 'output' },
      { type: 'tool-call', text: '[调用工具: x]', toolName: 'x', toolCallTone: 'running' },
    ];
    const prevMsg = '译文[调用工具: x]';
    const result = tryIncrementalFormat(prevParts, prevMsg.length, `${prevMsg}继续译`);

    expect(result).not.toBeNull();
    expect(result![2]).toEqual({ type: 'content', text: '继续译', mode: 'output' });
  });

  it('思考模式下追加仍不带 mode 字段', () => {
    const prevParts: FormattedMessagePart[] = [{ type: 'content', text: '推理' }];
    const result = tryIncrementalFormat(prevParts, 2, '推理中');
    expect(result![0]).toEqual({ type: 'content', text: '推理中' });
  });
});
