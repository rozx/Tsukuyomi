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

type AskUserRequest = {
  id: string;
  payload: AskUserPayload;
  resolve: (result: AskUserResult) => void;
  reject: (error: Error) => void;
  createdAt: number;
};

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
    currentPayload(state): AskUserPayload | null {
      return state.current?.payload ?? null;
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
        const req: AskUserRequest = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
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

    submitSelected(index: number, answer: string): void {
      if (!this.current) return;
      const selectedIndex = Number.isFinite(index) ? index : undefined;
      this.current.resolve({
        cancelled: false,
        answer,
        ...(typeof selectedIndex === 'number' ? { selected_index: selectedIndex } : {}),
      });
      this._shiftNext();
    },

    submitFreeText(answer: string): void {
      if (!this.current) return;
      const text = typeof answer === 'string' ? answer.trim() : '';
      if (!text) return;
      this.current.resolve({
        cancelled: false,
        answer: text,
      });
      this._shiftNext();
    },

    cancel(): void {
      if (!this.current) return;
      this.current.resolve({ cancelled: true });
      this._shiftNext();
    },

    rejectCurrent(error: Error): void {
      if (!this.current) return;
      this.current.reject(error);
      this._shiftNext();
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
        this.current.resolve({ cancelled: true });
      }
      // 取消队列
      for (const req of this.queue) {
        req.resolve({ cancelled: true });
      }
      this.queue = [];
      this.current = null;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAskUserStore, import.meta.hot));
}

