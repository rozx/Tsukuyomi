import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick, reactive } from 'vue';
import type { App } from 'vue';
import ImportSourceRow from '../components/import/ImportSourceRow.vue';
import type { ImportSource } from '../models/import';

let app: App | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  app?.unmount();
  host?.remove();
});

describe('来源行删除入口', () => {
  it('提供独立删除按钮，点击不打开正文，锁定时不能删除', async () => {
    const remove = vi.fn();
    const open = vi.fn();
    const source: ImportSource = {
      id: 's',
      taskId: 't',
      name: '小说.txt',
      kind: 'file',
      origin: 'user',
      purpose: 'content-root',
      status: 'registered',
      createdAt: 0,
    };
    host = document.createElement('div');
    document.body.appendChild(host);
    const props = reactive({
      source,
      depth: 0,
      selected: false,
      referenced: false,
      removeDisabled: false,
      onRemove: remove,
      onOpen: open,
    });
    app = createApp({ render: () => h(ImportSourceRow, props) });
    app.mount(host);
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="删除来源 小说.txt"]');
    expect(button).not.toBeNull();
    button!.click();
    expect(remove).toHaveBeenCalledExactlyOnceWith('s');
    expect(open).not.toHaveBeenCalled();
    props.removeDisabled = true;
    await nextTick();
    expect(button!.disabled).toBe(true);
    button!.click();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
