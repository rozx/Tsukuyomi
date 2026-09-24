import './setup';
import { describe, expect, it } from 'vitest';
import { planCompaction } from '../services/ai/context/plan-compaction';
import { estimateMessagesTokenCount } from '../utils/ai-token-utils';
import type { ChatMessage } from '../services/ai/types/ai-service';

const user = (content: string): ChatMessage => ({ role: 'user', content });
const reply = (content: string): ChatMessage => ({ role: 'assistant', content });
const call: ChatMessage = {
  role: 'assistant',
  content: null,
  tool_calls: ['a', 'b'].map((id) => ({
    id,
    type: 'function',
    function: { name: 'read', arguments: '{"id":"book-1"}' },
    providerMetadata: { google: { thoughtSignature: id } },
  })),
};
const result = (id: string): ChatMessage => ({
  role: 'tool',
  tool_call_id: id,
  name: 'read',
  content: `结果 ${id}`,
});
const tokens = (messages: ChatMessage[]) =>
  messages.reduce((n, m) => n + estimateMessagesTokenCount([m]), 0);

describe('保留近期历史的压缩规划', () => {
  it.each([[], [user('仅请求')], [user('请求'), reply('回答')]].map((history) => ({ history })))(
    '空历史、单条和可全部保留时不适用 $history',
    ({ history }) => {
      expect(planCompaction({ history, keepRecentBudget: 10000, pinnedIndex: 0 })).toBeNull();
    },
  );
  it('按预算从后保留完整旧轮次，理想切点在旧 assistant 前时回退到 user', () => {
    const history = [
      user('旧问题'),
      reply('旧回答'),
      user('上一轮'),
      reply('上一轮回答'),
      user('本轮请求'),
    ];
    const plan = planCompaction({
      history,
      keepRecentBudget: tokens(history.slice(3)),
      pinnedIndex: 4,
    })!;
    expect(plan.keep).toEqual(history.slice(2));
    expect(plan.summarize).toEqual(history.slice(0, 2));
  });
  it.each([3, 4])('理想切点落在工具结果 %s 前，完整保留调用组', (cut) => {
    const history = [
      user('旧轮'),
      reply('旧回答'),
      user('本轮'),
      call,
      result('a'),
      result('b'),
      reply('收到'),
    ];
    const plan = planCompaction({
      history,
      keepRecentBudget: tokens(history.slice(cut + 1)),
      pinnedIndex: 2,
    })!;
    expect(plan.keep).toEqual(history.slice(2));
    expect(plan.keep[1]).toBe(call);
    expect(plan.summarize).toEqual(history.slice(0, 2));
  });
  it('本轮中已完成的工具组可摘要，但当前 user 与后续 assistant 原样保留', () => {
    const history = [
      user('旧轮'),
      reply('旧回答'),
      user('本轮'),
      call,
      result('a'),
      result('b'),
      reply('下一步'),
    ];
    const plan = planCompaction({
      history,
      keepRecentBudget: tokens(history.slice(6)),
      pinnedIndex: 2,
    })!;
    expect(plan.keep).toEqual([history[2], history[6]]);
    expect(plan.summarize).toEqual([...history.slice(0, 2), ...history.slice(3, 6)]);
  });
  it('预算零时保留当前请求和未答完的工具组及已有结果', () => {
    const history = [user('本轮'), reply('已完成的思考'), call, result('a')];
    const plan = planCompaction({ history, keepRecentBudget: 0, pinnedIndex: 0 })!;
    expect(plan.keep).toEqual([history[0], call, result('a')]);
    expect(plan.summarize).toEqual([history[1]]);
  });
  it('单轮手动压缩只保留当前 user，不因默认预算而跳过', () => {
    const history = [user('本轮'), reply('回复')];
    expect(planCompaction({ history, keepRecentBudget: 0, pinnedIndex: 0 })).toEqual({
      keep: [history[0]],
      summarize: [history[1]],
    });
  });
  it('结构上不可拆分时返回 null', () => {
    const history = [user('本轮'), call, result('a')];
    expect(planCompaction({ history, keepRecentBudget: 0, pinnedIndex: 0 })).toBeNull();
  });
  it.each([
    { history: [reply('无用户')], pinnedIndex: 0 },
    { history: [user('本轮'), result('unknown')], pinnedIndex: 0 },
    { history: [user('本轮')], pinnedIndex: 20 },
  ])('损坏历史或 pin 不合法时安全跳过 $history', (input) => {
    expect(planCompaction({ ...input, keepRecentBudget: 0 })).toBeNull();
  });
  it('规划不修改原数组、工具元数据或消息内容', () => {
    const history = [user('前轮'), call, result('a'), result('b'), user('本轮')];
    const before = JSON.stringify(history);
    const plan = planCompaction({ history, keepRecentBudget: 0, pinnedIndex: 4 })!;
    expect(JSON.stringify(history)).toBe(before);
    expect(plan.summarize[1]).toBe(call);
    expect(plan.keep[0]?.role).toBe('user');
  });
});
