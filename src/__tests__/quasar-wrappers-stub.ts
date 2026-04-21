// Stub for #q-app/wrappers so istanbul can instrument boot/router/store
// entry points during coverage collection. None of these factories are
// actually invoked during tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defineBoot = (fn: any) => fn;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defineRouter = (fn: any) => fn;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defineStore = (fn: any) => fn;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defineSsrMiddleware = (fn: any) => fn;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const definePreFetch = (fn: any) => fn;
