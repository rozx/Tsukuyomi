declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: string;
    VUE_ROUTER_MODE: 'hash' | 'history' | 'abstract' | undefined;
    VUE_ROUTER_BASE: string | undefined;
    /** 构建时注入的短 SHA（见 vite-plugins/build-info.ts） */
    APP_BUILD_COMMIT: string | undefined;
    /** 构建时注入的提交数，浅克隆等无法确定时为空字符串 */
    APP_BUILD_COMMIT_COUNT: string | undefined;
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<Record<string, never>, Record<string, never>, any>;
  export default component;
}
