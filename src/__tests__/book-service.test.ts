// 必须在所有其他导入之前导入 setup，以确保 polyfill 在 idb 库导入之前设置
import './setup';

import { describe, expect, it, mock, beforeEach } from 'bun:test';
import type { Novel } from '../models/novel';

// Mock objects
const mockPut = mock((_storeName: string, _value: unknown) => Promise.resolve(undefined));
const mockGetAll = mock((_storeName: string) => Promise.resolve([]));
const mockGet = mock((_storeName: string, _key: string) => Promise.resolve(undefined as unknown));
const mockDelete = mock((_storeName: string, _key: string) => Promise.resolve(undefined));
const mockClear = mock((_storeName: string) => Promise.resolve(undefined));
const mockStorePut = mock(() => Promise.resolve(undefined));
const mockTransaction = mock(() => ({
  objectStore: () => ({
    put: mockStorePut,
  }),
  done: Promise.resolve(),
}));

const mockDb = {
  getAll: mockGetAll,
  get: mockGet,
  put: mockPut,
  delete: mockDelete,
  clear: mockClear,
  transaction: mockTransaction,
};

// Mock the module BEFORE importing BookService
await mock.module('src/utils/indexed-db', () => ({
  getDB: () => Promise.resolve(mockDb),
}));

// Import BookService AFTER mocking
import { BookService } from '../services/book-service';

describe('BookService', () => {
  beforeEach(() => {
    mockPut.mockClear();
    mockGetAll.mockClear();
    mockGet.mockClear();
    mockDelete.mockClear();
    mockClear.mockClear();
    mockStorePut.mockClear();
    mockTransaction.mockClear();
  });

  it('should get all books', async () => {
    mockGetAll.mockResolvedValueOnce([]);
    const books = await BookService.getAllBooks();
    expect(books).toEqual([]);
    expect(mockGetAll).toHaveBeenCalledWith('books');
  });

  it('should get a book by id', async () => {
    const mockBook = { id: '1', title: 'Test' };
    mockGet.mockResolvedValueOnce(mockBook);
    
    const book = await BookService.getBookById('1');
    expect(book).toEqual(mockBook as Novel);
    expect(mockGet).toHaveBeenCalledWith('books', '1');
  });

  it('should save a book', async () => {
    const book = { id: '1', title: 'Test', createdAt: new Date() } as Novel;
    await BookService.saveBook(book);
    expect(mockPut).toHaveBeenCalled();
    // Check that the first argument to put was 'books'
    expect(mockPut.mock.calls[0]?.[0]).toBe('books');
    // Check that dates were serialized
    const savedBook = mockPut.mock.calls[0]?.[1] as any;
    expect(typeof savedBook?.createdAt).toBe('string');
  });

  it('should bulk save books', async () => {
    const books = [
      { id: '1', title: 'Book 1' },
      { id: '2', title: 'Book 2' },
    ] as Novel[];

    await BookService.bulkSaveBooks(books);
    expect(mockTransaction).toHaveBeenCalledWith('books', 'readwrite');
    expect(mockStorePut).toHaveBeenCalledTimes(2);
  });

  it('should delete a book', async () => {
    await BookService.deleteBook('1');
    expect(mockDelete).toHaveBeenCalledWith('books', '1');
  });

  it('should clear all books', async () => {
    await BookService.clearBooks();
    expect(mockClear).toHaveBeenCalledWith('books');
  });
});

