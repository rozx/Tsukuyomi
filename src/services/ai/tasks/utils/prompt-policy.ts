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
export function createPromptPolicy(): IPromptPolicy {
  return {
    getCurrentStatusInfo,
    getPlanningLoopPrompt,
    getWorkingLoopPrompt,
    getWorkingFinishedPrompt,
    getWorkingContinuePrompt,
    getMissingParagraphsPrompt,
    getReviewLoopPrompt,
    getUnauthorizedToolPrompt,
    getStatusRestrictedToolPrompt,
    getToolLimitReachedPrompt,
    getBriefPlanningToolWarningPrompt,
  };
}
