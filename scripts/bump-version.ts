#!/usr/bin/env bun
/**
 * Bump version in package.json and src/constants/version.ts
 * Usage: bun scripts/bump-version.ts <major|minor|patch|version>
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const packageJsonPath = join(process.cwd(), 'package.json');
const versionFilePath = join(process.cwd(), 'src/constants/version.ts');

const args = process.argv.slice(2);
const bumpType = args[0];

if (!bumpType) {
  console.error('Usage: bun scripts/bump-version.ts <major|minor|patch|version>');
  process.exit(1);
}

try {
  // Read package.json
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  let version = packageJson.version;

  if (!version) {
    throw new Error('Version not found in package.json');
  }

  const parts = version.split('.');
  const [major, minor, patch] = parts.map(Number);

  if (bumpType === 'major') {
    version = `${major + 1}.0.0`;
  } else if (bumpType === 'minor') {
    version = `${major}.${minor + 1}.0`;
  } else if (bumpType === 'patch') {
    version = `${major}.${minor}.${patch + 1}`;
  } else {
    // Validate version string if it looks like a version
    if (/^\d+\.\d+\.\d+$/.test(bumpType)) {
      version = bumpType;
    } else {
      // Allow setting arbitrary version string if needed, but warn
      console.warn('Warning: Version does not look like x.y.z');
      version = bumpType;
    }
  }

  // Update package.json
  packageJson.version = version;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
  console.log(`✅ Updated package.json to version: ${version}`);

  // Update src/constants/version.ts
  const versionFileContent = `// 应用版本号
// 此文件由 scripts/bump-version.ts 自动生成，请勿手动修改
// 如需更新版本，请运行: bun scripts/bump-version.ts <major|minor|patch|version>
export const APP_VERSION = '${version}';
`;

  writeFileSync(versionFilePath, versionFileContent, 'utf-8');
  console.log(`✅ Updated src/constants/version.ts to version: ${version}`);
} catch (error) {
  console.error('❌ Failed to bump version:', error);
  process.exit(1);
}
