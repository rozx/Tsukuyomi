import { describe, test, expect } from 'bun:test';
import {
  DEFAULT_TASK_CHUNK_SIZE,
  MAX_TASK_CHUNK_SIZE,
  MIN_TASK_CHUNK_SIZE,
  resolveTaskChunkSize,
  resolveRuntimeTaskChunkSize,
} from 'src/services/ai/tasks/utils/chunk-formatter';

describe('chunk-formatter', () => {
  describe('resolveTaskChunkSize', () => {
    test('应在未提供值时返回默认分块大小', () => {
      expect(resolveTaskChunkSize()).toBe(DEFAULT_TASK_CHUNK_SIZE);
    });

    test('应在 null 时回退到默认分块大小', () => {
      expect(resolveTaskChunkSize(null as unknown as number)).toBe(DEFAULT_TASK_CHUNK_SIZE);
    });

    test('应在无效值时回退到默认分块大小', () => {
      expect(resolveTaskChunkSize(Number.NaN)).toBe(DEFAULT_TASK_CHUNK_SIZE);
      expect(resolveTaskChunkSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_TASK_CHUNK_SIZE);
      expect(resolveTaskChunkSize('abc' as unknown as number)).toBe(DEFAULT_TASK_CHUNK_SIZE);
    });

    test('应将过小值钳制到最小分块大小', () => {
      expect(resolveTaskChunkSize(1)).toBe(MIN_TASK_CHUNK_SIZE);
      expect(resolveTaskChunkSize(-100)).toBe(MIN_TASK_CHUNK_SIZE);
    });

    test('应将过大值钳制到最大分块大小', () => {
      expect(resolveTaskChunkSize(999999)).toBe(MAX_TASK_CHUNK_SIZE);
    });

    test('应接受可转为数字的字符串值（脏数据兼容）', () => {
      expect(resolveTaskChunkSize('12000' as unknown as number)).toBe(12000);
    });

    test('应对小数向下取整', () => {
      expect(resolveTaskChunkSize(4321.9)).toBe(4321);
    });
  });

  describe('resolveRuntimeTaskChunkSize', () => {
    test('应在未提供值时返回默认分块大小', () => {
      expect(resolveRuntimeTaskChunkSize()).toBe(DEFAULT_TASK_CHUNK_SIZE);
    });

    test('应在 null 时回退到默认分块大小', () => {
      expect(resolveRuntimeTaskChunkSize(null as unknown as number)).toBe(DEFAULT_TASK_CHUNK_SIZE);
    });

    test('应在无效值时回退到默认分块大小', () => {
      expect(resolveRuntimeTaskChunkSize(Number.NaN)).toBe(DEFAULT_TASK_CHUNK_SIZE);
      expect(resolveRuntimeTaskChunkSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_TASK_CHUNK_SIZE);
      expect(resolveRuntimeTaskChunkSize('abc' as unknown as number)).toBe(DEFAULT_TASK_CHUNK_SIZE);
    });

    test('应允许小于 MIN_TASK_CHUNK_SIZE 的值（最小为 1）', () => {
      // 与 resolveTaskChunkSize 的关键区别：允许小分块
      expect(resolveRuntimeTaskChunkSize(1)).toBe(1);
      expect(resolveRuntimeTaskChunkSize(100)).toBe(100);
      expect(resolveRuntimeTaskChunkSize(500)).toBe(500);
      expect(resolveRuntimeTaskChunkSize(999)).toBe(999);
    });

    test('应将负值钳制到 1', () => {
      expect(resolveRuntimeTaskChunkSize(-100)).toBe(1);
      expect(resolveRuntimeTaskChunkSize(0)).toBe(1);
    });

    test('应将过大值钳制到最大分块大小', () => {
      expect(resolveRuntimeTaskChunkSize(999999)).toBe(MAX_TASK_CHUNK_SIZE);
    });

    test('应接受可转为数字的字符串值（脏数据兼容）', () => {
      expect(resolveRuntimeTaskChunkSize('12000' as unknown as number)).toBe(12000);
    });

    test('应对小数向下取整', () => {
      expect(resolveRuntimeTaskChunkSize(4321.9)).toBe(4321);
    });
  });
});
