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

  // Validate version format before parsing
  // Remove any pre-release or build metadata (e.g., "1.0.0-alpha" -> "1.0.0")
  const cleanVersion = version.split('-')[0].split('+')[0];
  const versionRegex = /^\d+\.\d+\.\d+$/;

  if (!versionRegex.test(cleanVersion)) {
    throw new Error(
      `Invalid version format in package.json: "${version}". ` +
        `Expected format: x.y.z (e.g., "1.0.0"). ` +
        `Current version must be a valid semver format before bumping.`,
    );
  }

  const parts = cleanVersion.split('.');
  const [major, minor, patch] = parts.map(Number);

  // Validate parsed numbers are not NaN
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    throw new Error(
      `Failed to parse version "${version}". ` +
        `Parsed values: major=${major}, minor=${minor}, patch=${patch}. ` +
        `Please ensure the version is in x.y.z format.`,
    );
  }

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
