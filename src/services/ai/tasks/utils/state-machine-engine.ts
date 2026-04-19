import { getValidTransitionsForTaskType, type TaskStatus, type TaskType } from './task-types';

/**
 * 纯状态机：仅负责状态保存与合法状态迁移校验
 */
export class StateMachineEngine {
  private currentStatus: TaskStatus;
  private readonly validTransitions: Record<TaskStatus, TaskStatus[]>;

  constructor(taskType: TaskType, initialStatus: TaskStatus = 'planning') {
    this.currentStatus = initialStatus;
    this.validTransitions = getValidTransitionsForTaskType(taskType);
  }

  public isValidTransition(next: TaskStatus): boolean {
    if (this.currentStatus === next) {
      return true;
    }

    const allowed = this.validTransitions[this.currentStatus];
    return !!allowed && allowed.includes(next);
  }

  /**
   * 兼容旧流程中的直接状态同步（例如 review 内部回退）
   */
  public setCurrentStatus(status: TaskStatus): void {
    this.currentStatus = status;
  }
}
