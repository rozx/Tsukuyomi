import type { ToolDefinition, ToolContext } from './types';
import type {
  AskUserBatchPayload,
  AskUserBatchResult,
  AskUserPayload,
  AskUserResult,
} from 'src/stores/ask-user';
import { GlobalConfig } from 'src/services/global-config-cache';

export const askUserTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'ask_user',
        description:
          '向用户提问并等待用户回答。会弹出全屏对话框展示问题与候选答案，用户也可以输入自定义答案。适用于关键歧义、缺失信息或需要用户偏好决策的场景。',
        parameters: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: '要向用户展示的问题（必填）',
            },
            suggested_answers: {
              type: 'array',
              description: '可选的候选答案列表（用户可一键选择）',
              items: { type: 'string' },
            },
            allow_free_text: {
              type: 'boolean',
              description: '是否允许用户输入自定义答案（默认 true）',
            },
            placeholder: {
              type: 'string',
              description: '自定义输入框的占位符（可选）',
            },
            submit_label: {
              type: 'string',
              description: '提交按钮文本（可选）',
            },
            cancel_label: {
              type: 'string',
              description: '取消按钮文本（可选）',
            },
            max_length: {
              type: 'number',
              description: '自定义输入最大长度（可选）',
            },
          },
          required: ['question'],
        },
      },
    },
    handler: async (args: AskUserPayload, context: ToolContext) => {
      const { onAction } = context;

      const question = typeof args?.question === 'string' ? args.question.trim() : '';
      if (!question) {
        return JSON.stringify({ success: false, error: 'question 不能为空' });
      }

      // 书籍级配置：若开启“跳过 AI 追问”，则直接返回 cancelled（不弹 UI）
      const bookId = typeof context?.bookId === 'string' ? context.bookId : undefined;
      if (bookId && (await GlobalConfig.isSkipAskUserEnabledForBook(bookId))) {
        if (onAction) {
          onAction({
            type: 'ask',
            entity: 'user',
            data: {
              tool_name: 'ask_user',
              question,
              cancelled: true,
              ...(Array.isArray(args.suggested_answers)
                ? { suggested_answers: args.suggested_answers }
                : {}),
            },
          });
        }

        return JSON.stringify({
          success: false,
          cancelled: true,
          question,
        });
      }

      const payload: AskUserPayload = {
        question,
        ...(Array.isArray(args.suggested_answers)
          ? { suggested_answers: args.suggested_answers }
          : {}),
        ...(typeof args.allow_free_text === 'boolean'
          ? { allow_free_text: args.allow_free_text }
          : {}),
        ...(typeof args.placeholder === 'string' ? { placeholder: args.placeholder } : {}),
        ...(typeof args.submit_label === 'string' ? { submit_label: args.submit_label } : {}),
        ...(typeof args.cancel_label === 'string' ? { cancel_label: args.cancel_label } : {}),
        ...(typeof args.max_length === 'number' ? { max_length: args.max_length } : {}),
      };

      // 通过全局桥接等待用户回答（类似 __lunaToast 的思路）
      const askFn =
        typeof window !== 'undefined'
          ? (window as unknown as { __lunaAskUser?: (p: AskUserPayload) => Promise<AskUserResult> })
              .__lunaAskUser
          : undefined;

      if (!askFn) {
        return JSON.stringify({
          success: false,
          error: 'AskUser UI 不可用（无法弹出对话框）',
        });
      }

      try {
        const result = await askFn(payload);

        // 记录 action（用于聊天历史与上下文摘要）
        if (onAction) {
          onAction({
            type: 'ask',
            entity: 'user',
            data: {
              tool_name: 'ask_user',
              question,
              ...(Array.isArray(payload.suggested_answers)
                ? { suggested_answers: payload.suggested_answers }
                : {}),
              ...(typeof result.answer === 'string' ? { answer: result.answer } : {}),
              ...(typeof result.selected_index === 'number'
                ? { selected_index: result.selected_index }
                : {}),
              ...(result.cancelled ? { cancelled: true } : {}),
            },
          });
        }

        if (result.cancelled) {
          return JSON.stringify({
            success: false,
            cancelled: true,
            question,
            ...(typeof result.answer === 'string' ? { answer: result.answer } : {}),
            ...(typeof result.selected_index === 'number'
              ? { selected_index: result.selected_index }
              : {}),
          });
        }

        return JSON.stringify({
          success: true,
          question,
          answer: result.answer,
          ...(typeof result.selected_index === 'number'
            ? { selected_index: result.selected_index }
            : {}),
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return JSON.stringify({ success: false, error: msg, question });
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'ask_user_batch',
        description:
          '向用户一次性提出多个问题并等待回答（Stepper 一题一屏）。适用于需要用户一次确认多个偏好/关键歧义的场景；用户中途取消会返回已答部分（partial answers）。',
        parameters: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              description: '问题列表（必填，至少 1 题）',
              items: {
                type: 'object',
                properties: {
                  question: {
                    type: 'string',
                    description: '要向用户展示的问题（必填）',
                  },
                  suggested_answers: {
                    type: 'array',
                    description: '可选的候选答案列表（用户可一键选择）',
                    items: { type: 'string' },
                  },
                  allow_free_text: {
                    type: 'boolean',
                    description: '是否允许用户输入自定义答案（默认 true）',
                  },
                  placeholder: {
                    type: 'string',
                    description: '自定义输入框的占位符（可选）',
                  },
                  submit_label: {
                    type: 'string',
                    description: '提交按钮文本（可选）',
                  },
                  cancel_label: {
                    type: 'string',
                    description: '取消按钮文本（可选）',
                  },
                  max_length: {
                    type: 'number',
                    description: '自定义输入最大长度（可选）',
                  },
                },
                required: ['question'],
              },
            },
          },
          required: ['questions'],
        },
      },
    },
    handler: async (args: AskUserBatchPayload, context: ToolContext) => {
      const { onAction } = context;

      const questions = Array.isArray(args?.questions) ? args.questions : [];
      // 注意：ask-user store 会过滤空问题，但会保留原始 question_index（基于输入数组下标）。
      // 因此这里用于 action 记录的 questions 也必须保持“按原始下标对齐”的数组，避免后续通过
      // questions[question_index] 映射时发生错位/越界。
      const questionTextsByIndex = questions.map((q) =>
        typeof q?.question === 'string' ? q.question.trim() : '',
      );
      const nonEmptyQuestionTexts = questionTextsByIndex.filter((q) => !!q);

      if (nonEmptyQuestionTexts.length === 0) {
        return JSON.stringify({ success: false, error: 'questions 不能为空' });
      }

      // 书籍级配置：若开启“跳过 AI 追问”，则直接返回 cancelled（不弹 UI）
      const bookId = typeof context?.bookId === 'string' ? context.bookId : undefined;
      if (bookId && (await GlobalConfig.isSkipAskUserEnabledForBook(bookId))) {
        if (onAction) {
          onAction({
            type: 'ask',
            entity: 'user',
            data: {
              tool_name: 'ask_user_batch',
              questions: questionTextsByIndex,
              cancelled: true,
              answers: [],
            },
          });
        }

        return JSON.stringify({
          success: false,
          cancelled: true,
          answers: [],
        });
      }

      const payload: AskUserBatchPayload = {
        questions,
      };

      const askBatchFn =
        typeof window !== 'undefined'
          ? (
              window as unknown as {
                __lunaAskUserBatch?: (p: AskUserBatchPayload) => Promise<AskUserBatchResult>;
              }
            ).__lunaAskUserBatch
          : undefined;

      if (!askBatchFn) {
        return JSON.stringify({
          success: false,
          error: 'AskUserBatch UI 不可用（无法弹出对话框）',
        });
      }

      try {
        const result = await askBatchFn(payload);

        if (onAction) {
          onAction({
            type: 'ask',
            entity: 'user',
            data: {
              tool_name: 'ask_user_batch',
              questions: questionTextsByIndex,
              answers: result.answers,
              ...(result.cancelled ? { cancelled: true } : {}),
            },
          });
        }

        if (result.cancelled) {
          return JSON.stringify({
            success: false,
            cancelled: true,
            answers: result.answers,
          });
        }

        return JSON.stringify({
          success: true,
          answers: result.answers,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return JSON.stringify({ success: false, error: msg });
      }
    },
  },
];
