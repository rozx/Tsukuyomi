import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import type { NavigationGuardWithThis, RouteRecordRaw } from 'vue-router';
import { FEATURES, isNavTabEnabled } from 'src/constants/features';
import { ImportAgentService } from 'src/services/import/import-agent-service';
import { ImportApplicationService } from 'src/services/import/import-application-service';
import type { ImportConfirmation } from 'src/services/import/import-application-service';
import { getDB } from 'src/utils/indexed-db';
import type { AIModel } from 'src/services/ai/types/ai-model';
import routes from 'src/router/routes';
import { webLocksFixture } from './web-locks-fixture';

const model = { id: 'm', enabled: true } as AIModel;

function importRoute(): RouteRecordRaw {
  const route = routes[0]?.children?.find((entry) => entry.path === 'import/:taskId?');
  if (!route) throw new Error('缺少导入路由');
  return route;
}

describe('导入工作台开关（回退路径）', () => {
  beforeEach(() => vi.stubGlobal('navigator', { locks: webLocksFixture() }));
  afterEach(() => {
    FEATURES.importWorkspace = true;
    vi.unstubAllGlobals();
  });

  it('开启时导航与路由照常可用', () => {
    expect(isNavTabEnabled('import')).toBe(true);
    const guard = importRoute().beforeEnter as NavigationGuardWithThis<undefined>;
    expect(guard.call(undefined, {} as never, {} as never, () => undefined)).toBe(true);
  });

  it('关闭后隐藏导航入口并把导入路由重定向到首页，其他入口不受影响', () => {
    FEATURES.importWorkspace = false;
    expect(isNavTabEnabled('import')).toBe(false);
    expect(isNavTabEnabled('library')).toBe(true);
    const guard = importRoute().beforeEnter as NavigationGuardWithThis<undefined>;
    expect(guard.call(undefined, {} as never, {} as never, () => undefined)).toBe('/');
  });

  it('关闭后拒绝启动 Agent、压缩与应用导入', async () => {
    FEATURES.importWorkspace = false;
    await expect(ImportAgentService.run('task', model)).rejects.toThrow('IMPORT_DISABLED');
    await expect(ImportAgentService.compact('task', model)).rejects.toThrow('IMPORT_DISABLED');
    await expect(new ImportApplicationService().apply({} as ImportConfirmation)).rejects.toThrow(
      'IMPORT_DISABLED',
    );
  });

  it('关闭后数据库仍为当前版本并保留导入 stores，不需要降级', async () => {
    FEATURES.importWorkspace = false;
    const db = await getDB();
    expect(db.objectStoreNames.contains('import-tasks')).toBe(true);
    expect(db.objectStoreNames.contains('import-operations')).toBe(true);
  });
});
