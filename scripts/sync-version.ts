#!/usr/bin/env bun
/**
 * 同步 package.json 中的版本号到 src/constants/version.ts
 * 运行方式: bun scripts/sync-version.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const packageJsonPath = join(process.cwd(), 'package.json');
const versionFilePath = join(process.cwd(), 'src/constants/version.ts');

try {
  // 读取 package.json
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const version = packageJson.version;

  if (!version) {
    throw new Error('package.json 中未找到 version 字段');
  }

  // 生成版本常量文件内容
  const versionFileContent = `// 应用版本号
// 此文件由 scripts/sync-version.ts 自动生成，请勿手动修改
// 如需更新版本，请修改 package.json 中的 version 字段，然后运行: bun scripts/sync-version.ts
export const APP_VERSION = '${version}';
`;

  // 写入版本文件
  writeFileSync(versionFilePath, versionFileContent, 'utf-8');
  console.log(`✅ 版本已同步: ${version}`);
} catch (error) {
  console.error('❌ 同步版本失败:', error);
  process.exit(1);
}

