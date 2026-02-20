import { getValidTransitionsForTaskType, type TaskStatus, type TaskType } from './task-types';

/**
 * 纯状态机：仅负责状态保存与合法状态迁移校验
 */
export class StateMachineEngine {
  private currentStatus: TaskStatus;
  private readonly validTransitions: Record<TaskStatus, TaskStatus[]>;

  constructor(
    private readonly taskType: TaskType,
    initialStatus: TaskStatus = 'planning',
  ) {
    this.currentStatus = initialStatus;
    this.validTransitions = getValidTransitionsForTaskType(taskType);
  }

  public getCurrentStatus(): TaskStatus {
    return this.currentStatus;
  }

  public isValidTransition(next: TaskStatus): boolean {
    if (this.currentStatus === next) {
      return true;
    }

    const allowed = this.validTransitions[this.currentStatus];
    return !!allowed && allowed.includes(next);
  }

  public transition(next: TaskStatus): void {
    if (!this.isValidTransition(next)) {
      throw new Error(
        `无效状态迁移：${this.taskType} 任务不允许从 ${this.currentStatus} 迁移到 ${next}`,
      );
    }

    this.currentStatus = next;
  }

  /**
   * 兼容旧流程中的直接状态同步（例如 review 内部回退）
   */
  public setCurrentStatus(status: TaskStatus): void {
    this.currentStatus = status;
  }
}
