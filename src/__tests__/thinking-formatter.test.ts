import { describe, it, expect } from 'bun:test';
import {
  formatThinkingMessage,
  tryIncrementalFormat,
  type FormattedMessagePart,
} from 'src/composables/useThinkingFormatter';

describe('tryIncrementalFormat', () => {
  it('纯文本追加应命中快速路径并扩展最后一个 content 片段', () => {
    const prevParts: FormattedMessagePart[] = [{ type: 'content', text: 'Hello' }];
    const result = tryIncrementalFormat(prevParts, 5, 'Hello world');

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({ type: 'content', text: 'Hello world' });
  });

  it('最后一个片段不是 content 时应新增 content 片段', () => {
    const prevParts: FormattedMessagePart[] = [
      {
        type: 'tool-call',
        text: '[调用工具: search]',
        toolName: 'search',
        toolCallTone: 'success',
      },
    ];
    const prevLen = '[调用工具: search]'.length;
    const newMsg = '[调用工具: search]后续思考';

    const result = tryIncrementalFormat(prevParts, prevLen, newMsg);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![1]).toEqual({ type: 'content', text: '后续思考' });
    // 原有 tool-call 引用应保持不变（v-memo 依赖这一点避免重渲染）
    expect(result![0]).toBe(prevParts[0]);
  });

  it('追加内容中包含 [ 时应回退到完整解析（返回 null）', () => {
    const prevParts: FormattedMessagePart[] = [{ type: 'content', text: 'thinking...' }];
    const result = tryIncrementalFormat(prevParts, 11, 'thinking...[调用工具: foo]');

    expect(result).toBeNull();
  });

  it('旧消息末尾存在未闭合 [ 时应回退到完整解析（返回 null）', () => {
    // 旧消息以半成品标记 "正在 [调用工" 结尾，新尾部 "具: foo]" 会补完它
    const oldMsg = '正在 [调用工';
    const newMsg = '正在 [调用工具: foo]';
    const prevParts: FormattedMessagePart[] = [{ type: 'content', text: oldMsg }];

    const result = tryIncrementalFormat(prevParts, oldMsg.length, newMsg);

    expect(result).toBeNull();
  });

  it('旧消息末尾的 [ 已被 ] 闭合时应允许快速路径', () => {
    // chunk-separator 标记完整闭合，后续追加的纯文本应走快速路径
    const oldMsg = '[=== 翻译块 1/5 ===]\n\n开始翻译';
    const newMsg = `${oldMsg}中`;
    const prevParts: FormattedMessagePart[] = [
      { type: 'chunk-separator', text: '[=== 翻译块 1/5 ===]', chunkInfo: '翻译块 1/5' },
      { type: 'content', text: '开始翻译' },
    ];

    const result = tryIncrementalFormat(prevParts, oldMsg.length, newMsg);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![1]).toEqual({ type: 'content', text: '开始翻译中' });
  });

  it('空尾部应返回原始 prevParts 引用（便于上层跳过渲染）', () => {
    const prevParts: FormattedMessagePart[] = [{ type: 'content', text: 'Hello' }];
    const result = tryIncrementalFormat(prevParts, 5, 'Hello');

    expect(result).toBe(prevParts);
  });

  it('新消息比已解析长度更短时应回退到完整解析（返回 null）', () => {
    const prevParts: FormattedMessagePart[] = [{ type: 'content', text: 'Hello world' }];
    const result = tryIncrementalFormat(prevParts, 11, 'Hi');

    expect(result).toBeNull();
  });

  it('快速路径命中时不应改动原有的 prevParts 数组', () => {
    const prevParts: FormattedMessagePart[] = [{ type: 'content', text: 'Hello' }];
    const snapshot = prevParts.slice();

    tryIncrementalFormat(prevParts, 5, 'Hello world');

    expect(prevParts).toEqual(snapshot);
  });
});

describe('formatThinkingMessage（status 影响 tool-call 回填 tone）', () => {
  // 此组测试覆盖「状态切换触发完整重解析」所依赖的行为：
  // 同一条包含未闭合 tool-call 的消息，在不同 taskStatus 下应得到不同的 fallback tone。
  // 这验证了 useThinkingFormatter 在检测到 status 变化时调用 fullReparse 的必要性。

  const messageWithPendingToolCall = '准备调用工具\n[调用工具: search_db]\n等待结果...';

  it('status=thinking 时未闭合的 tool-call 应为 running', () => {
    const parts = formatThinkingMessage(messageWithPendingToolCall, 'thinking');
    const toolCall = parts.find((p) => p.type === 'tool-call');

    expect(toolCall).toBeDefined();
    expect(toolCall!.toolCallTone).toBe('running');
  });

  it('status=end 时未闭合的 tool-call 应被回填为 success', () => {
    const parts = formatThinkingMessage(messageWithPendingToolCall, 'end');
    const toolCall = parts.find((p) => p.type === 'tool-call');

    expect(toolCall).toBeDefined();
    expect(toolCall!.toolCallTone).toBe('success');
  });

  it('status=cancelled 时未闭合的 tool-call 应被回填为 cancelled', () => {
    const parts = formatThinkingMessage(messageWithPendingToolCall, 'cancelled');
    const toolCall = parts.find((p) => p.type === 'tool-call');

    expect(toolCall).toBeDefined();
    expect(toolCall!.toolCallTone).toBe('cancelled');
  });

  it('status=error 时未闭合的 tool-call 应被回填为 error', () => {
    const parts = formatThinkingMessage(messageWithPendingToolCall, 'error');
    const toolCall = parts.find((p) => p.type === 'tool-call');

    expect(toolCall).toBeDefined();
    expect(toolCall!.toolCallTone).toBe('error');
  });
});
