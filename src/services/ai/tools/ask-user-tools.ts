import { toolDefinition } from './tool-localization';
import { describeTool } from './tool-localization';
import { parseToolArgs, type ActionInfo, type ToolDefinition, type ToolContext } from './types';
import type {
  AskUserBatchPayload,
  AskUserBatchResult,
  AskUserPayload,
  AskUserResult,
} from 'src/stores/ask-user';
import { GlobalConfig } from 'src/services/global-config-cache';
import type { AppLocale } from 'src/models/locale';
import { AGENT_LOCALE, translateText } from 'src/i18n/translate';
import { localizedErrorMessage, localizedErrorCode } from 'src/utils/localized-error';

type AskUserOnAction = ToolContext['onAction'];

/**
 * ask_user / ask_user_batch 共用的单题 JSON Schema 字段：一个问题 + 候选答案 + 自由输入控制。
 */
const ASK_USER_QUESTION_PROPERTIES = {
  question: {
    type: 'string',
    description: describeTool('ask_user.parameters.properties.question'),
  },
  suggested_answers: {
    type: 'array',
    description: describeTool('ask_user.parameters.properties.suggested_answers'),
    items: { type: 'string' },
  },
  allow_free_text: {
    type: 'boolean',
    description: describeTool('ask_user.parameters.properties.allow_free_text'),
  },
  placeholder: {
    type: 'string',
    description: describeTool('ask_user.parameters.properties.placeholder'),
  },
  submit_label: {
    type: 'string',
    description: describeTool('ask_user.parameters.properties.submit_label'),
  },
  cancel_label: {
    type: 'string',
    description: describeTool('ask_user.parameters.properties.cancel_label'),
  },
  max_length: {
    type: 'number',
    description: describeTool('ask_user.parameters.properties.max_length'),
  },
} as const;

const ASK_USER_QUESTION_REQUIRED: string[] = ['question'];

function handleAskUserSkipped(
  question: string,
  parsedArgs: AskUserPayload,
  onAction: AskUserOnAction,
): string {
  onAction?.({
    type: 'ask',
    entity: 'user',
    data: {
      tool_name: 'ask_user',
      question,
      cancelled: true,
      ...(Array.isArray(parsedArgs.suggested_answers)
        ? { suggested_answers: parsedArgs.suggested_answers }
        : {}),
    },
  });
  return JSON.stringify({ success: false, cancelled: true, question });
}

function buildAskUserPayload(question: string, parsedArgs: AskUserPayload): AskUserPayload {
  return {
    question,
    ...(Array.isArray(parsedArgs.suggested_answers)
      ? { suggested_answers: parsedArgs.suggested_answers }
      : {}),
    ...(typeof parsedArgs.allow_free_text === 'boolean'
      ? { allow_free_text: parsedArgs.allow_free_text }
      : {}),
    ...(typeof parsedArgs.placeholder === 'string' ? { placeholder: parsedArgs.placeholder } : {}),
    ...(typeof parsedArgs.submit_label === 'string'
      ? { submit_label: parsedArgs.submit_label }
      : {}),
    ...(typeof parsedArgs.cancel_label === 'string'
      ? { cancel_label: parsedArgs.cancel_label }
      : {}),
    ...(typeof parsedArgs.max_length === 'number' ? { max_length: parsedArgs.max_length } : {}),
  };
}

function resolveAskUserBridge(): ((p: AskUserPayload) => Promise<AskUserResult>) | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __lunaAskUser?: (p: AskUserPayload) => Promise<AskUserResult> })
    .__lunaAskUser;
}

async function invokeAskUserBridge(
  question: string,
  payload: AskUserPayload,
  askFn: (p: AskUserPayload) => Promise<AskUserResult>,
  onAction: AskUserOnAction,
  feedbackLocale: AppLocale,
): Promise<string> {
  try {
    const result = await askFn(payload);
    onAction?.({
      type: 'ask',
      entity: 'user',
      data: buildAskUserActionData(question, payload, result),
    });
    if (result.cancelled) {
      return JSON.stringify(buildAskUserCancelledJson(question, result));
    }
    return JSON.stringify(buildAskUserSuccessJson(question, result));
  } catch (error) {
    return JSON.stringify(buildAskUserErrorJson(question, error, feedbackLocale));
  }
}

/**
 * 构造 ask_user 的 read/ask 操作回调数据（仅含实际存在的字段）
 */
function buildAskUserActionData(
  question: string,
  payload: AskUserPayload,
  result: AskUserResult,
): Extract<ActionInfo['data'], { tool_name: 'ask_user' }> {
  return {
    tool_name: 'ask_user',
    question,
    ...(Array.isArray(payload.suggested_answers)
      ? { suggested_answers: payload.suggested_answers }
      : {}),
    ...(typeof result.answer === 'string' ? { answer: result.answer } : {}),
    ...(typeof result.selected_index === 'number' ? { selected_index: result.selected_index } : {}),
    ...(result.cancelled ? { cancelled: true } : {}),
  };
}

/**
 * ask_user 用户取消时的 JSON 响应体
 */
function buildAskUserCancelledJson(question: string, result: AskUserResult) {
  return {
    success: false,
    cancelled: true,
    question,
    ...(typeof result.answer === 'string' ? { answer: result.answer } : {}),
    ...(typeof result.selected_index === 'number' ? { selected_index: result.selected_index } : {}),
  };
}

/**
 * ask_user 成功时的 JSON 响应体
 */
function buildAskUserSuccessJson(question: string, result: AskUserResult) {
  return {
    success: true,
    question,
    answer: result.answer,
    ...(typeof result.selected_index === 'number' ? { selected_index: result.selected_index } : {}),
  };
}

/**
 * ask_user 异常时的 JSON 响应体
 */
function buildAskUserErrorJson(question: string, error: unknown, feedbackLocale: AppLocale) {
  const msg = localizedErrorMessage(error, feedbackLocale, 'aiEntityFeedback.askFailed');
  return { success: false, error_code: localizedErrorCode(error), error: msg, question };
}

export const askUserTools: ToolDefinition[] = [
  {
    definition: toolDefinition('ask_user', {
      type: 'object',
      properties: ASK_USER_QUESTION_PROPERTIES,
      required: ASK_USER_QUESTION_REQUIRED,
    }),
    handler: async (args, context: ToolContext) => {
      const feedbackLocale = AGENT_LOCALE;
      const { onAction } = context;
      const parsedArgs = parseToolArgs<AskUserPayload>(args);
      const question = typeof parsedArgs?.question === 'string' ? parsedArgs.question.trim() : '';
      if (!question) {
        return JSON.stringify({
          success: false,
          error_code: 'QUESTION_REQUIRED',
          error: translateText(feedbackLocale, 'aiEntityFeedback.questionRequired'),
        });
      }

      const bookId = typeof context?.bookId === 'string' ? context.bookId : undefined;
      if (bookId && (await GlobalConfig.isSkipAskUserEnabledForBook(bookId))) {
        return handleAskUserSkipped(question, parsedArgs, onAction);
      }

      const payload = buildAskUserPayload(question, parsedArgs);
      const askFn = resolveAskUserBridge();
      if (!askFn) {
        return JSON.stringify({
          success: false,
          error_code: 'ASK_UI_UNAVAILABLE',
          error: translateText(feedbackLocale, 'aiEntityFeedback.askUnavailable'),
        });
      }
      return invokeAskUserBridge(question, payload, askFn, onAction, feedbackLocale);
    },
  },
  {
    definition: toolDefinition('ask_user_batch', {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: describeTool('ask_user_batch.parameters.properties.questions'),
          items: {
            type: 'object',
            properties: ASK_USER_QUESTION_PROPERTIES,
            required: ASK_USER_QUESTION_REQUIRED,
          },
        },
      },
      required: ['questions'],
    }),
    handler: async (args, context: ToolContext) => {
      const feedbackLocale = AGENT_LOCALE;
      const { onAction } = context;
      const parsedArgs = parseToolArgs<AskUserBatchPayload>(args);

      const questions = Array.isArray(parsedArgs?.questions) ? parsedArgs.questions : [];
      // 注意：ask-user store 会过滤空问题，但会保留原始 question_index（基于输入数组下标）。
      // 因此这里用于 action 记录的 questions 也必须保持“按原始下标对齐”的数组，避免后续通过
      // questions[question_index] 映射时发生错位/越界。
      const questionTextsByIndex = questions.map((q) =>
        typeof q?.question === 'string' ? q.question.trim() : '',
      );
      const nonEmptyQuestionTexts = questionTextsByIndex.filter((q) => !!q);

      if (nonEmptyQuestionTexts.length === 0) {
        return JSON.stringify({
          success: false,
          error_code: 'QUESTIONS_REQUIRED',
          error: translateText(feedbackLocale, 'aiEntityFeedback.questionsRequired'),
        });
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
          error_code: 'ASK_UI_UNAVAILABLE',
          error: translateText(feedbackLocale, 'aiEntityFeedback.askBatchUnavailable'),
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
        const msg = localizedErrorMessage(error, feedbackLocale, 'aiEntityFeedback.askFailed');
        return JSON.stringify({
          success: false,
          error_code: localizedErrorCode(error),
          error: msg,
        });
      }
    },
  },
];
