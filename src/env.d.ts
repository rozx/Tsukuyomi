/**
 * Quasar CLI 已经为它自己注入的 import.meta.env.QUASAR_* 生成了类型（见 .quasar/），
 * 这里只声明项目自己在 quasar.config.ts 的 build.defineEnv 里加的那些。
 */
interface ImportMetaEnv {
  /** 构建时注入的短 SHA（见 vite-plugins/build-info.ts） */
  readonly APP_BUILD_COMMIT: string | undefined;
  /** 构建时注入的提交数，浅克隆等无法确定时为空字符串 */
  readonly APP_BUILD_COMMIT_COUNT: string | undefined;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<Record<string, never>, Record<string, never>, any>;
  export default component;
}
