import type {
  ImportPendingQuestion,
  ImportQuestionAnswer,
  ImportQuestionItem,
  ImportRunContext,
  ImportTask,
} from 'src/models/import';
import { ImportRepository } from './import-repository';
import type { NewEvent } from './import-repository';

type AskTool = 'ask_user' | 'ask_user_batch';
type AnswerInput = ImportQuestionAnswer['answers'];

/** 仍等待用户实际回答的必要问题；已回答但尚未补入工具结果的问题不再阻止继续执行。 */
export function awaitingImportAnswer(task: ImportTask): boolean {
  return Boolean(task.pendingQuestion?.required && !task.pendingQuestion.answer);
}

function questionItem(value: unknown): ImportQuestionItem {
  const entry = value as Record<string, unknown>;
  const question = typeof entry.question === 'string' ? entry.question.trim() : '';
  if (!question) throw new Error('INVALID_ARGUMENTS: question 不能为空');
  const suggestedAnswers = Array.isArray(entry.suggested_answers)
    ? (entry.suggested_answers as string[]).map((answer) => answer.trim()).filter(Boolean)
    : [];
  return {
    question,
    suggestedAnswers,
    // 没有候选时禁止自由输入会让问题无法回答
    allowFreeText: entry.allow_free_text !== false || suggestedAnswers.length === 0,
    ...(typeof entry.placeholder === 'string' ? { placeholder: entry.placeholder } : {}),
    ...(typeof entry.max_length === 'number' && entry.max_length > 0
      ? { maxLength: Math.floor(entry.max_length) }
      : {}),
  };
}

function questionItems(tool: AskTool, args: Record<string, unknown>): ImportQuestionItem[] {
  if (tool === 'ask_user') return [questionItem(args)];
  const items = (args.questions as unknown[]).map(questionItem);
  if (!items.length) throw new Error('INVALID_ARGUMENTS: questions 不能为空');
  return items;
}

/** 与普通问答工具的成功结果格式一致，模型在恢复后看到的是同一种回答。 */
function answerResult(question: ImportPendingQuestion): Record<string, unknown> {
  const answers = question.answer!.answers;
  if (question.tool === 'ask_user') {
    const [first] = answers;
    return {
      success: true,
      question: question.question,
      answer: first!.answer,
      ...(first!.selectedIndex !== undefined ? { selected_index: first!.selectedIndex } : {}),
    };
  }
  return {
    success: true,
    answers: answers.map((entry) => ({
      question_index: entry.questionIndex,
      answer: entry.answer,
      ...(entry.selectedIndex !== undefined ? { selected_index: entry.selectedIndex } : {}),
    })),
  };
}

function checkAnswer(item: ImportQuestionItem, entry: AnswerInput[number]): void {
  const answer = entry.answer.trim();
  if (!answer) throw new Error('INVALID_ANSWER: 回答不能为空');
  if (item.maxLength && answer.length > item.maxLength)
    throw new Error(`INVALID_ANSWER: 回答不能超过 ${item.maxLength} 字`);
  if (entry.selectedIndex !== undefined && item.suggestedAnswers[entry.selectedIndex] !== answer)
    throw new Error('INVALID_ANSWER: 选中项与回答不一致');
  if (!item.allowFreeText && !item.suggestedAnswers.includes(answer))
    throw new Error('INVALID_ANSWER: 只能从候选答案中选择');
}

function normalizedAnswers(question: ImportPendingQuestion, answers: AnswerInput): AnswerInput {
  const items = question.items ?? [];
  const indexes = new Set(answers.map((entry) => entry.questionIndex));
  // 部分回答等同于中途取消，不能解除等待
  if (answers.length !== items.length || indexes.size !== items.length)
    throw new Error('INVALID_ANSWER: 需要回答全部问题');
  return [...answers]
    .sort((a, b) => a.questionIndex - b.questionIndex)
    .map((entry) => {
      const item = items[entry.questionIndex];
      if (!item) throw new Error('INVALID_ANSWER: 问题序号无效');
      checkAnswer(item, entry);
      return { ...entry, answer: entry.answer.trim() };
    });
}

export class ImportQuestionService {
  /**
   * Agent 提问：保存问题并让出运行，不等待界面。已回答时返回原格式的工具结果并移除问题。
   * 返回 undefined 表示仍在等待用户回答。
   */
  static async ask(
    run: ImportRunContext,
    callId: string,
    tool: AskTool,
    args: Record<string, unknown>,
    finish: (data: unknown) => { events?: NewEvent[] },
  ): Promise<unknown> {
    const task = await ImportRepository.getTask(run.taskId);
    const existing = task?.pendingQuestion;
    if (existing?.toolCallId === callId && existing.answer) {
      return ImportRepository.mutateTask(
        run.taskId,
        (current) => {
          const question = current.pendingQuestion;
          if (question?.toolCallId !== callId || !question.answer)
            throw new Error('QUESTION_CHANGED: 问题已变化');
          delete current.pendingQuestion;
          return Promise.resolve(answerResult(question));
        },
        { run, finish },
      );
    }
    if (existing?.toolCallId === callId) return undefined;
    const items = questionItems(tool, args);
    await ImportRepository.mutateTask(
      run.taskId,
      (current) => {
        const id = crypto.randomUUID();
        current.pendingQuestion = {
          id,
          toolCallId: callId,
          kind: 'general',
          required: true,
          tool,
          items,
          question: items.map((item) => item.question).join('\n'),
          options: items[0]!.suggestedAnswers.map((label, index) => ({
            id: String(index),
            label,
          })),
          scopeRevision: current.draft.novelScope.revision,
          draftRevision: current.draft.revision,
        };
        return Promise.resolve(id);
      },
      {
        run,
        finish: (questionId) => ({
          events: [{ kind: 'question', callId, toolName: tool, data: { questionId, items } }],
        }),
      },
    );
    return undefined;
  }

  /** 用户在导入工作台回答 Agent 的问题；取消、部分回答或其他任务的回答都不解除等待。 */
  static async answer(
    taskId: string,
    questionId: string,
    answers: AnswerInput,
  ): Promise<ImportTask> {
    return ImportRepository.mutateTask(
      taskId,
      (task) => {
        const question = task.pendingQuestion;
        if (
          !question ||
          question.id !== questionId ||
          question.kind !== 'general' ||
          question.answer ||
          question.scopeRevision !== task.draft.novelScope.revision
        )
          throw new Error('QUESTION_CHANGED: 问题已变化或已回答');
        question.answer = { answers: normalizedAnswers(question, answers), answeredAt: Date.now() };
        if (task.state === 'waiting_user') task.state = 'paused';
        return Promise.resolve(task);
      },
      {
        finish: (task) => ({
          events: [
            {
              kind: 'answer',
              callId: task.pendingQuestion!.toolCallId,
              data: { questionId, answers: task.pendingQuestion!.answer!.answers },
            },
          ],
        }),
      },
    );
  }
}
