# Transformers.js 4.3.0 故障恢复补丁

`@huggingface/transformers@4.3.0.patch` 修复浏览器 session 初始化与推理的共享 Promise 链。
上游的 `.then(load)` / `.then(run)` 会保留第一次拒绝，导致 WebGPU 失败后的 WASM
回退以及后续推理继续抛出第一次错误。补丁让下一次调用在成功或失败后都能执行自身工作，
当前调用的错误仍正常传给调用方。

Bun 按 `package.json` 的 `patchedDependencies` 在安装时自动应用补丁。
源码、浏览器入口和 Node 的 ESM/CJS 入口保持一致；生产构建使用已修复的浏览器入口。

升级运行时后，用 `transformers-runtime-recovery.test.ts` 验证上游已修复这两个行为，
再移除补丁与 `patchedDependencies`。
