import { translateText } from 'src/i18n/translate';
import type { MessageKey } from 'src/i18n/types';
import type { AppLocale } from 'src/models/locale';
import {
  getValidTransitionsForTaskType,
  type TaskStatus,
  type TaskType,
} from 'src/services/ai/tasks/utils/task-types';
import { getPhaseChecklist } from 'src/services/ai/tasks/utils/todo-workflow';

/**
 * 外部 Agent 各类任务的步骤。快速上手指南与 MCP 工作流模板（Prompt / get_workflow_guide）
 * 都从这里生成，所以两边是同一份文字，Agent 读过其中一份就不需要再读另一份。
 *
 * 翻译、润色、校对的阶段顺序不在这里另写：它取自站内任务的状态机
 * （getValidTransitionsForTaskType），各阶段的清单取自站内任务的待办文字。
 */

type ChecklistPhase = Parameters<typeof getPhaseChecklist>[0];
/** 一个步骤；带 checklist 时，步骤下面列出站内对应阶段的待办清单 */
export type WorkflowStep = MessageKey | { key: MessageKey; checklist: ChecklistPhase };
/** 站内任务在结束之前经过的阶段 */
export type WorkflowPhase = Exclude<TaskStatus, 'end'>;

/** 按站内阶段组织的步骤：阶段之前、各阶段、阶段之后 */
export interface PhasedWorkflowSteps {
  before: readonly WorkflowStep[];
  phases: Partial<Record<WorkflowPhase, readonly WorkflowStep[]>>;
  after: readonly WorkflowStep[];
}

export type AgentWorkflowId =
  | 'translate-chapter'
  | 'polish-chapter'
  | 'import-book'
  | 'follow-updates'
  | 'maintain-worldbuilding'
  | 'rename-everywhere';

type AgentWorkflow = { id: AgentWorkflowId; titleKey: MessageKey } & (
  | { steps: readonly WorkflowStep[] }
  | { taskType: TaskType; phased: PhasedWorkflowSteps }
);

/** 站内任务依次经过的阶段（不含结束），沿状态机每一步的第一个去向走到结束 */
export function taskPhases(taskType: TaskType): WorkflowPhase[] {
  const transitions = getValidTransitionsForTaskType(taskType);
  const phases: WorkflowPhase[] = [];
  let current: TaskStatus = 'planning';
  while (current !== 'end' && !phases.includes(current)) {
    phases.push(current);
    current = transitions[current][0] ?? 'end';
  }
  return phases;
}

/**
 * 按给定的阶段顺序排出步骤。
 * @throws 某个阶段没有对应的步骤：说明站内流程变了而这里没有跟上，必须补上步骤而不是漏掉
 */
export function arrangeWorkflowSteps(
  workflow: PhasedWorkflowSteps,
  phases: readonly WorkflowPhase[],
): WorkflowStep[] {
  return [
    ...workflow.before,
    ...phases.flatMap((phase) => {
      const steps = workflow.phases[phase];
      if (!steps) {
        throw new Error(
          `External agent workflow has no steps for the built-in "${phase}" phase; add them in agent-mcp/workflows.ts.`,
        );
      }
      return steps;
    }),
    ...workflow.after,
  ];
}

/** 指南里按这个顺序列出 */
export const AGENT_WORKFLOWS: readonly AgentWorkflow[] = [
  {
    id: 'translate-chapter',
    titleKey: 'agentMcp.guide.wfTranslateTitle',
    taskType: 'translation',
    phased: {
      before: ['agentMcp.guide.wfTranslate1', 'agentMcp.guide.wfTranslate2'],
      phases: {
        planning: [{ key: 'agentMcp.guide.wfTranslatePlan', checklist: 'planning' }],
        working: ['agentMcp.guide.wfTranslate3', 'agentMcp.guide.wfTranslate4'],
        review: [{ key: 'agentMcp.guide.wfTranslateReview', checklist: 'review' }],
      },
      after: [
        'agentMcp.guide.wfTranslate5',
        { key: 'agentMcp.guide.wfTranslateBrief', checklist: 'brief' },
      ],
    },
  },
  {
    id: 'polish-chapter',
    titleKey: 'agentMcp.guide.wfPolishTitle',
    // 润色与校对在站内走同一套阶段
    taskType: 'polish',
    phased: {
      before: ['agentMcp.guide.wfPolish1'],
      phases: {
        planning: [{ key: 'agentMcp.guide.wfPolishPlan', checklist: 'planning' }],
        working: ['agentMcp.guide.wfPolish2', 'agentMcp.guide.wfPolish3'],
      },
      after: ['agentMcp.guide.wfPolish4'],
    },
  },
  {
    id: 'import-book',
    titleKey: 'agentMcp.guide.wfImportTitle',
    steps: ['agentMcp.guide.wfImport1', 'agentMcp.guide.wfImport2', 'agentMcp.guide.wfImport3'],
  },
  {
    id: 'follow-updates',
    titleKey: 'agentMcp.guide.wfUpdateTitle',
    steps: [
      'agentMcp.guide.wfUpdate1',
      'agentMcp.guide.wfUpdate2',
      'agentMcp.guide.wfUpdate3',
      'agentMcp.guide.wfUpdate4',
    ],
  },
  {
    id: 'maintain-worldbuilding',
    titleKey: 'agentMcp.guide.wfWorldTitle',
    steps: [
      'agentMcp.guide.wfWorld1',
      'agentMcp.guide.wfWorld2',
      'agentMcp.guide.wfWorld3',
      'agentMcp.guide.wfWorld4',
      'agentMcp.guide.wfWorld5',
    ],
  },
  {
    id: 'rename-everywhere',
    titleKey: 'agentMcp.guide.wfRenameTitle',
    steps: [
      'agentMcp.guide.wfRename1',
      'agentMcp.guide.wfRename2',
      'agentMcp.guide.wfRename3',
      'agentMcp.guide.wfRename4',
      'agentMcp.guide.wfRename5',
    ],
  },
];

/** 一个工作流的编号步骤（Markdown 行），清单作为步骤下的子项 */
export function renderWorkflowSteps(id: AgentWorkflowId, locale: AppLocale): string[] {
  const workflow = AGENT_WORKFLOWS.find((entry) => entry.id === id)!;
  const steps =
    'steps' in workflow
      ? workflow.steps
      : arrangeWorkflowSteps(workflow.phased, taskPhases(workflow.taskType));
  return steps.flatMap((step, index) =>
    typeof step === 'string'
      ? [`${index + 1}. ${translateText(locale, step)}`]
      : [
          `${index + 1}. ${translateText(locale, step.key)}`,
          ...getPhaseChecklist(step.checklist, locale, 'external').map((item) => `   - ${item}`),
        ],
  );
}

/** 所有任务都要遵守的通用规则；指南与工作流模板共用 */
export const AGENT_GENERAL_RULE_KEYS: readonly MessageKey[] = [
  'agentMcp.guide.ruleWriteBack',
  'agentMcp.guide.ruleIds',
  'agentMcp.guide.ruleNoRepeat',
  'agentMcp.guide.ruleConfirm',
  'agentMcp.guide.ruleAsk',
];
