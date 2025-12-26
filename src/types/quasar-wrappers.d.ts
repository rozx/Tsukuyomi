// Quasar 框架包装器类型声明
// 这些类型在构建时由 Quasar CLI 提供，这里仅用于类型检查

declare module '#q-app/wrappers' {
  import type { App } from 'vue';
  import type { Router } from 'vue-router';
  import type { Pinia } from 'pinia';

  export interface QuasarConfigContext {
    modeName: string;
    mode: Record<string, boolean>;
    [key: string]: unknown;
  }

  export interface BootFileContext {
    app: App;
    router?: Router;
    store?: Pinia;
    ssrContext?: unknown;
    [key: string]: unknown;
  }

  export interface RouterFileContext {
    store?: Pinia;
    ssrContext?: unknown;
    [key: string]: unknown;
  }

  export interface StoreFileContext {
    ssrContext?: unknown;
    [key: string]: unknown;
  }

  export function defineConfig(
    fn: (ctx: QuasarConfigContext) => Record<string, unknown>,
  ): Record<string, unknown>;

  export function defineBoot(
    fn: (ctx: BootFileContext) => void | Promise<void>,
  ): () => void | Promise<void>;

  export function defineRouter(
    fn: (ctx?: RouterFileContext) => Router | Promise<Router>,
  ): () => Router | Promise<Router>;

  export function defineStore(
    fn: (ctx?: StoreFileContext) => Pinia | Promise<Pinia>,
  ): () => Pinia | Promise<Pinia>;
}

