import type { ToolDefinition, ToolContext } from './types';
import type { AskUserPayload, AskUserResult } from 'src/stores/ask-user';

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

      const payload: AskUserPayload = {
        question,
        ...(Array.isArray(args.suggested_answers) ? { suggested_answers: args.suggested_answers } : {}),
        ...(typeof args.allow_free_text === 'boolean' ? { allow_free_text: args.allow_free_text } : {}),
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
              ...(Array.isArray(payload.suggested_answers) ? { suggested_answers: payload.suggested_answers } : {}),
              ...(typeof result.answer === 'string' ? { answer: result.answer } : {}),
              ...(typeof result.selected_index === 'number' ? { selected_index: result.selected_index } : {}),
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
            ...(typeof result.selected_index === 'number' ? { selected_index: result.selected_index } : {}),
          });
        }

        return JSON.stringify({
          success: true,
          question,
          answer: result.answer,
          ...(typeof result.selected_index === 'number' ? { selected_index: result.selected_index } : {}),
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return JSON.stringify({ success: false, error: msg, question });
      }
    },
  },
];

