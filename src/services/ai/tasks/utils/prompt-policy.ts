import {
  getBriefPlanningToolWarningPrompt,
  getCurrentStatusInfo,
  getMissingParagraphsPrompt,
  getPlanningLoopPrompt,
  getPreparingLoopPrompt,
  getReviewLoopPrompt,
  getStatusRestrictedToolPrompt,
  getToolLimitReachedPrompt,
  getUnauthorizedToolPrompt,
  getWorkingContinuePrompt,
  getWorkingFinishedPrompt,
  getWorkingLoopPrompt,
} from '../prompts';
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
  getPreparingLoopPrompt(taskType: TaskType, isLoopDetected: boolean): string;
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
export const PromptPolicy: IPromptPolicy = {
  getCurrentStatusInfo(
    taskType: TaskType,
    status: TaskStatus,
    isBriefPlanning?: boolean,
    hasNextChunk?: boolean,
  ): string {
    return getCurrentStatusInfo(taskType, status, isBriefPlanning, hasNextChunk);
  },

  getPlanningLoopPrompt(
    taskType: TaskType,
    isBriefPlanning: boolean,
    isLoopDetected: boolean,
  ): string {
    return getPlanningLoopPrompt(taskType, isBriefPlanning, isLoopDetected);
  },

  getPreparingLoopPrompt(taskType: TaskType, isLoopDetected: boolean): string {
    return getPreparingLoopPrompt(taskType, isLoopDetected);
  },

  getWorkingLoopPrompt(taskType: TaskType): string {
    return getWorkingLoopPrompt(taskType);
  },

  getWorkingFinishedPrompt(taskType: TaskType): string {
    return getWorkingFinishedPrompt(taskType);
  },

  getWorkingContinuePrompt(taskType: TaskType): string {
    return getWorkingContinuePrompt(taskType);
  },

  getMissingParagraphsPrompt(taskType: TaskType, missingIds: string[]): string {
    return getMissingParagraphsPrompt(taskType, missingIds);
  },

  getReviewLoopPrompt(taskType: TaskType): string {
    return getReviewLoopPrompt(taskType);
  },

  getUnauthorizedToolPrompt(taskType: TaskType, toolName: string): string {
    return getUnauthorizedToolPrompt(taskType, toolName);
  },

  getStatusRestrictedToolPrompt(
    toolName: string,
    currentStatus: TaskStatus,
    taskType?: TaskType,
  ): string {
    return getStatusRestrictedToolPrompt(toolName, currentStatus, taskType);
  },

  getToolLimitReachedPrompt(toolName: string, limit: number): string {
    return getToolLimitReachedPrompt(toolName, limit);
  },

  getBriefPlanningToolWarningPrompt(): string {
    return getBriefPlanningToolWarningPrompt();
  },
};
