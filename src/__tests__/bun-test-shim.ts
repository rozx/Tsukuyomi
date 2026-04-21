import {
  describe,
  it,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from 'vitest';

type MockFn = typeof vi.fn & {
  module: typeof vi.mock;
  restore: typeof vi.restoreAllMocks;
};

const mock = ((impl?: (...args: unknown[]) => unknown) =>
  impl ? vi.fn(impl) : vi.fn()) as unknown as MockFn;
mock.module = ((...args: Parameters<typeof vi.mock>) =>
  vi.mock(...args)) as typeof vi.mock;
mock.restore = () => vi.restoreAllMocks();

const spyOn: typeof vi.spyOn = (...args) => vi.spyOn(...args);

export {
  describe,
  it,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  mock,
  spyOn,
};
