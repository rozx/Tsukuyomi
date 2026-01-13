import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { useAskUserStore } from 'src/stores/ask-user';

describe('ask-user store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('enqueue 多个问题时应按顺序展示并逐个 resolve', async () => {
    const store = useAskUserStore();

    const p1 = store.ask({ question: 'Q1', suggested_answers: ['A1'] });
    const p2 = store.ask({ question: 'Q2', suggested_answers: ['B1'] });

    expect(store.isVisible).toBe(true);
    expect(store.currentPayload?.question).toBe('Q1');
    expect(store.queueLength).toBe(2);

    store.submitSelected(0, 'A1');
    const r1 = await p1;
    expect(r1.cancelled).toBe(false);
    if (!r1.cancelled) {
      expect(r1.answer).toBe('A1');
    }

    expect(store.currentPayload?.question).toBe('Q2');

    store.submitSelected(0, 'B1');
    const r2 = await p2;
    expect(r2.cancelled).toBe(false);
    if (!r2.cancelled) {
      expect(r2.answer).toBe('B1');
    }

    expect(store.isVisible).toBe(false);
    expect(store.queueLength).toBe(0);
  });

  it('cancel 应返回 cancelled=true 并推进队列', async () => {
    const store = useAskUserStore();

    const p1 = store.ask({ question: 'Q1' });
    const p2 = store.ask({ question: 'Q2' });

    store.cancel();
    const r1 = await p1;
    expect(r1.cancelled).toBe(true);

    expect(store.currentPayload?.question).toBe('Q2');

    store.cancel();
    const r2 = await p2;
    expect(r2.cancelled).toBe(true);

    expect(store.isVisible).toBe(false);
  });

  it('askBatch 应按 Stepper 逐题推进，取消时返回 partial answers（含 question_index）', async () => {
    const store = useAskUserStore();

    const p = store.askBatch({
      questions: [
        { question: 'Q1', suggested_answers: ['A1'] },
        { question: 'Q2', suggested_answers: ['B1'] },
        { question: 'Q3', allow_free_text: true },
      ],
    });

    expect(store.isVisible).toBe(true);
    expect(store.currentMode).toBe('batch');
    expect(store.currentPayload?.question).toBe('Q1');
    expect(store.currentBatchProgress?.index).toBe(0);
    expect(store.currentBatchProgress?.total).toBe(3);

    // 第 1 题选择答案 → 自动进入第 2 题
    store.submitSelected(0, 'A1');
    expect(store.currentPayload?.question).toBe('Q2');
    expect(store.currentBatchProgress?.index).toBe(1);

    // 中途取消：应返回已答部分（只含 Q1）
    store.cancel();
    const r = await p;
    expect(r.cancelled).toBe(true);
    expect(r.answers.length).toBe(1);
    expect(r.answers[0]?.question_index).toBe(0);
    expect(r.answers[0]?.answer).toBe('A1');

    expect(store.isVisible).toBe(false);
  });
});

