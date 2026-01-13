import { defineStore, acceptHMRUpdate } from 'pinia';

export interface AskUserPayload {
  question: string;
  suggested_answers?: string[];
  allow_free_text?: boolean;
  placeholder?: string;
  submit_label?: string;
  cancel_label?: string;
  max_length?: number;
}

export type AskUserResult =
  | {
      cancelled: true;
      answer?: string;
      selected_index?: number;
    }
  | {
      cancelled: false;
      answer: string;
      selected_index?: number;
    };

export interface AskUserBatchPayload {
  questions: AskUserPayload[];
}

export interface AskUserBatchAnswer {
  question_index: number;
  answer: string;
  selected_index?: number;
}

export type AskUserBatchResult =
  | {
      cancelled: true;
      answers: AskUserBatchAnswer[];
    }
  | {
      cancelled: false;
      answers: AskUserBatchAnswer[];
    };

type AskUserSingleRequest = {
  id: string;
  mode: 'single';
  payload: AskUserPayload;
  resolve: (result: AskUserResult) => void;
  reject: (error: Error) => void;
  createdAt: number;
};

type AskUserBatchRequest = {
  id: string;
  mode: 'batch';
  questions: Array<{
    question_index: number;
    payload: AskUserPayload;
  }>;
  currentIndex: number;
  answers: AskUserBatchAnswer[];
  resolve: (result: AskUserBatchResult) => void;
  reject: (error: Error) => void;
  createdAt: number;
};

type AskUserRequest = AskUserSingleRequest | AskUserBatchRequest;

function normalizePayload(payload: AskUserPayload): AskUserPayload {
  const question = typeof payload.question === 'string' ? payload.question.trim() : '';
  return {
    question,
    ...(Array.isArray(payload.suggested_answers)
      ? { suggested_answers: payload.suggested_answers.filter((x) => typeof x === 'string') }
      : {}),
    ...(typeof payload.allow_free_text === 'boolean'
      ? { allow_free_text: payload.allow_free_text }
      : { allow_free_text: true }),
    ...(typeof payload.placeholder === 'string' ? { placeholder: payload.placeholder } : {}),
    ...(typeof payload.submit_label === 'string' ? { submit_label: payload.submit_label } : {}),
    ...(typeof payload.cancel_label === 'string' ? { cancel_label: payload.cancel_label } : {}),
    ...(typeof payload.max_length === 'number' ? { max_length: payload.max_length } : {}),
  };
}

export const useAskUserStore = defineStore('askUser', {
  state: () => ({
    queue: [] as AskUserRequest[],
    current: null as AskUserRequest | null,
  }),

  getters: {
    isVisible(state): boolean {
      return !!state.current;
    },
    currentMode(state): 'single' | 'batch' | null {
      return state.current?.mode ?? null;
    },
    currentPayload(state): AskUserPayload | null {
      if (!state.current) return null;
      if (state.current.mode === 'single') return state.current.payload;

      const currentQuestion = state.current.questions[state.current.currentIndex];
      return currentQuestion?.payload ?? null;
    },
    currentBatchProgress(state): { index: number; total: number } | null {
      if (!state.current || state.current.mode !== 'batch') return null;
      return {
        index: state.current.currentIndex,
        total: state.current.questions.length,
      };
    },
    currentBatchAnswer(state): AskUserBatchAnswer | null {
      if (!state.current || state.current.mode !== 'batch') return null;
      const currentQuestion = state.current.questions[state.current.currentIndex];
      if (!currentQuestion) return null;
      return state.current.answers.find((a) => a.question_index === currentQuestion.question_index) ?? null;
    },
    isCurrentBatchAnswered(state): boolean {
      if (!state.current || state.current.mode !== 'batch') return false;
      const currentQuestion = state.current.questions[state.current.currentIndex];
      if (!currentQuestion) return false;
      return state.current.answers.some((a) => a.question_index === currentQuestion.question_index);
    },
    queueLength(state): number {
      return state.queue.length + (state.current ? 1 : 0);
    },
  },

  actions: {
    /**
     * 发起一次“向用户提问”，返回 Promise 等待用户回答。
     * - 自动排队：同一时刻仅显示一个对话框
     */
    ask(payload: AskUserPayload): Promise<AskUserResult> {
      const normalized = normalizePayload(payload);
      if (!normalized.question) {
        return Promise.resolve({
          cancelled: true,
        });
      }

      return new Promise<AskUserResult>((resolve, reject) => {
        const req: AskUserSingleRequest = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          mode: 'single',
          payload: normalized,
          resolve,
          reject,
          createdAt: Date.now(),
        };

        if (!this.current) {
          this.current = req;
        } else {
          this.queue.push(req);
        }
      });
    },

    /**
     * 发起一次“批量向用户提问”，返回 Promise 等待用户逐题回答。
     * - 采用同一个队列：任意时刻仅显示一个对话框
     * - 取消时返回已答部分（partial answers），并包含 question_index 以映射回原问题
     */
    askBatch(payload: AskUserBatchPayload): Promise<AskUserBatchResult> {
      const rawQuestions = Array.isArray(payload?.questions) ? payload.questions : [];
      const normalizedQuestions = rawQuestions
        .map((q, idx) => ({
          question_index: idx,
          payload: normalizePayload(q),
        }))
        .filter((q) => !!q.payload.question);

      if (normalizedQuestions.length === 0) {
        return Promise.resolve({ cancelled: true, answers: [] });
      }

      return new Promise<AskUserBatchResult>((resolve, reject) => {
        const req: AskUserBatchRequest = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          mode: 'batch',
          questions: normalizedQuestions,
          currentIndex: 0,
          answers: [],
          resolve,
          reject,
          createdAt: Date.now(),
        };

        if (!this.current) {
          this.current = req;
        } else {
          this.queue.push(req);
        }
      });
    },

    submitSelected(index: number, answer: string): void {
      if (!this.current) return;
      const selectedIndex = Number.isFinite(index) ? index : undefined;
      if (this.current.mode === 'single') {
        this.current.resolve({
          cancelled: false,
          answer,
          ...(typeof selectedIndex === 'number' ? { selected_index: selectedIndex } : {}),
        });
        this._shiftNext();
        return;
      }

      const currentQuestion = this.current.questions[this.current.currentIndex];
      if (!currentQuestion) return;
      this._upsertBatchAnswer(currentQuestion.question_index, answer, selectedIndex);
      this._advanceBatchOrResolve();
    },

    submitFreeText(answer: string): void {
      if (!this.current) return;
      const text = typeof answer === 'string' ? answer.trim() : '';
      if (!text) return;
      if (this.current.mode === 'single') {
        this.current.resolve({
          cancelled: false,
          answer: text,
        });
        this._shiftNext();
        return;
      }

      const currentQuestion = this.current.questions[this.current.currentIndex];
      if (!currentQuestion) return;
      this._upsertBatchAnswer(currentQuestion.question_index, text);
      this._advanceBatchOrResolve();
    },

    prevBatchQuestion(): void {
      if (!this.current || this.current.mode !== 'batch') return;
      if (this.current.currentIndex <= 0) return;
      this.current.currentIndex = Math.max(0, this.current.currentIndex - 1);
    },

    nextBatchQuestion(): void {
      if (!this.current || this.current.mode !== 'batch') return;
      if (this.current.currentIndex >= this.current.questions.length - 1) return;
      const currentQuestion = this.current.questions[this.current.currentIndex];
      if (!currentQuestion) return;
      const answered = this.current.answers.some((a) => a.question_index === currentQuestion.question_index);
      if (!answered) return;
      this.current.currentIndex = Math.min(this.current.questions.length - 1, this.current.currentIndex + 1);
    },

    cancel(): void {
      if (!this.current) return;
      if (this.current.mode === 'single') {
        this.current.resolve({ cancelled: true });
        this._shiftNext();
        return;
      }

      this.current.resolve({
        cancelled: true,
        answers: [...this.current.answers],
      });
      this._shiftNext();
    },

    rejectCurrent(error: Error): void {
      if (!this.current) return;
      this.current.reject(error);
      this._shiftNext();
    },

    _upsertBatchAnswer(questionIndex: number, answer: string, selectedIndex?: number): void {
      if (!this.current || this.current.mode !== 'batch') return;
      const existing = this.current.answers.find((a) => a.question_index === questionIndex);
      if (existing) {
        existing.answer = answer;
        if (typeof selectedIndex === 'number') existing.selected_index = selectedIndex;
        else delete existing.selected_index;
        return;
      }
      this.current.answers.push({
        question_index: questionIndex,
        answer,
        ...(typeof selectedIndex === 'number' ? { selected_index: selectedIndex } : {}),
      });
    },

    _advanceBatchOrResolve(): void {
      if (!this.current || this.current.mode !== 'batch') return;
      const isLast = this.current.currentIndex >= this.current.questions.length - 1;
      if (isLast) {
        this.current.resolve({
          cancelled: false,
          answers: [...this.current.answers].sort((a, b) => a.question_index - b.question_index),
        });
        this._shiftNext();
        return;
      }
      this.current.currentIndex = Math.min(this.current.questions.length - 1, this.current.currentIndex + 1);
    },

    _shiftNext(): void {
      if (this.queue.length > 0) {
        const next = this.queue.shift() ?? null;
        this.current = next;
      } else {
        this.current = null;
      }
    },

    clearAll(): void {
      // 取消当前
      if (this.current) {
        if (this.current.mode === 'single') {
          this.current.resolve({ cancelled: true });
        } else {
          this.current.resolve({ cancelled: true, answers: [...this.current.answers] });
        }
      }
      // 取消队列
      for (const req of this.queue) {
        if (req.mode === 'single') {
          req.resolve({ cancelled: true });
        } else {
          req.resolve({ cancelled: true, answers: [] });
        }
      }
      this.queue = [];
      this.current = null;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAskUserStore, import.meta.hot));
}

