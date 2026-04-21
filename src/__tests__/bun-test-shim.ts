/* eslint-disable @typescript-eslint/unbound-method */
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

const mock = vi.fn as MockFn;
mock.module = vi.mock;
mock.restore = vi.restoreAllMocks;

const spyOn = vi.spyOn;

const jest = vi;

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
  jest,
};
