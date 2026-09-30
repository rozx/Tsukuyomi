import type { AppLocale } from 'src/models/locale';
import { getCurrentStatusInfo } from '../prompts/common';
import {
  getBriefPlanningToolWarningPrompt,
  getMissingParagraphsPrompt,
  getPlanningLoopPrompt,
  getReviewLoopPrompt,
  getStatusRestrictedToolPrompt,
  getToolLimitReachedPrompt,
  getUnauthorizedToolPrompt,
  getWorkingContinuePrompt,
  getWorkingFinishedPrompt,
  getWorkingLoopPrompt,
} from '../prompts/runner';
import type { TaskStatus, TaskType } from './task-types';

/**
 * 提示词策略接口：定义 task-runner 提示词生成的契约，
 * 便于测试时注入替身（mock）和保持类型安全。
 */
export interface IPromptPolicy {
  getCurrentStatusInfo(
    taskType: TaskType,
    status: TaskStatus,
    isBriefPlanning?: boolean,
    hasNextChunk?: boolean,
  ): string;
  getPlanningLoopPrompt(
    taskType: TaskType,
    isBriefPlanning: boolean,
    isLoopDetected: boolean,
  ): string;
  getWorkingLoopPrompt(taskType: TaskType): string;
  getWorkingFinishedPrompt(taskType: TaskType): string;
  getWorkingContinuePrompt(taskType: TaskType): string;
  getMissingParagraphsPrompt(taskType: TaskType, missingIds: string[]): string;
  getReviewLoopPrompt(taskType: TaskType): string;
  getUnauthorizedToolPrompt(taskType: TaskType, toolName: string): string;
  getStatusRestrictedToolPrompt(
    toolName: string,
    currentStatus: TaskStatus,
    taskType?: TaskType,
  ): string;
  getToolLimitReachedPrompt(toolName: string, limit: number): string;
  getBriefPlanningToolWarningPrompt(): string;
}

/**
 * 提示词策略层：集中管理 task-runner 的所有提示词生成
 */
export function createPromptPolicy(locale: AppLocale = 'zh-CN'): IPromptPolicy {
  return {
    getCurrentStatusInfo: (task, status, brief, next) =>
      getCurrentStatusInfo(task, status, brief, next, locale),
    getPlanningLoopPrompt: (task, brief, loop) => getPlanningLoopPrompt(task, brief, loop, locale),
    getWorkingLoopPrompt: (task) => getWorkingLoopPrompt(task, locale),
    getWorkingFinishedPrompt: (task) => getWorkingFinishedPrompt(task, locale),
    getWorkingContinuePrompt: (task) => getWorkingContinuePrompt(task, locale),
    getMissingParagraphsPrompt: (task, ids) => getMissingParagraphsPrompt(task, ids, locale),
    getReviewLoopPrompt: (task) => getReviewLoopPrompt(task, locale),
    getUnauthorizedToolPrompt: (task, tool) => getUnauthorizedToolPrompt(task, tool, locale),
    getStatusRestrictedToolPrompt: (tool, status, task) =>
      getStatusRestrictedToolPrompt(tool, status, task, locale),
    getToolLimitReachedPrompt: (tool, limit) => getToolLimitReachedPrompt(tool, limit, locale),
    getBriefPlanningToolWarningPrompt: () => getBriefPlanningToolWarningPrompt(locale),
  };
}
export const PromptPolicy = createPromptPolicy();
