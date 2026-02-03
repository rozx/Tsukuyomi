/**
 * 共享的 fake-indexeddb mock 配置
 *
 * 所有测试文件应该使用这个共享的 mock，而不是各自创建 mock 对象
 * 这样可以避免模块缓存问题
 */

import { fakeIndexedDB } from 'fake-indexeddb/auto';

// 创建共享的 fake-indexeddb 实例
export const fakeIndexedDB = fakeIndexedDB();

// 导出创建数据库的函数（如果需要）
export const createFakeDB = (name = 'tsukuyomi-test', version = 1) => {
  return fakeIndexedDB(name, version);
};

// 导出 getDB 函数
export const getFakeDB = () => {
  return fakeIndexedDB;
};
