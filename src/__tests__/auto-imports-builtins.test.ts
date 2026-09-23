import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * unplugin-auto-import 会把未声明的标识符解析成 PrimeVue 组件。若浏览器内置对象
 * （如 DataView）被解析，`new DataView(...)` 会在运行时变成导入组件而失败（ZIP／EPUB 解析即如此）。
 * 生成的声明文件记录了实际注入的标识符，这里防止它再次遮蔽内置对象。
 */
describe('自动导入不遮蔽内置对象', () => {
  it('auto-imports.d.ts 中没有与 JS／DOM 全局同名的声明', () => {
    const dts = readFileSync(resolve(__dirname, '../auto-imports.d.ts'), 'utf8');
    const declared = [...dts.matchAll(/const (\w+):/g)].map((match) => match[1]!);
    const shadowed = declared.filter((name) => name in globalThis);
    expect(shadowed).toEqual([]);
  });
});
