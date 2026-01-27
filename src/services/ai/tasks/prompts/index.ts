/**
 * 共享提示词模块（优化版）
 * 精简提示词以提高速度、效率和准确性
 */

// 导出所有通用规则和工具
export * from './common';

// 导出各服务专用的 prompts
export * from './translation';
export * from './proofreading';
export * from './polish';
export * from './chapter-summary';
export * from './term-translation';
export * from './explain';
export * from './assistant';
export * from './runner';
