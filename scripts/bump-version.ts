#!/usr/bin/env bun
/**
 * Bump version in package.json and src/constants/version.ts
 * Usage: bun scripts/bump-version.ts <major|minor|patch|version>
 * Examples:
 *   bun scripts/bump-version.ts major     - Bump major version (e.g., 0.8.4 -> 1.0.0)
 *   bun scripts/bump-version.ts minor     - Bump minor version (e.g., 0.8.4 -> 0.9.0)
 *   bun scripts/bump-version.ts patch     - Bump patch version (e.g., 0.8.4 -> 0.8.5)
 *   bun scripts/bump-version.ts 0.5.18    - Set version directly
 *
 * Note: 只维护 x.y.z。界面上的提交数 / 短 SHA 在构建时由 vite-plugins/build-info.ts 生成，
 * 不写进仓库（以前 pre-commit 自动写 build 号会让并行分支的 PR 必然冲突）。
 * 传入 4 段版本（如分支名 release/0.9.0.55）时只取前 3 段。
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

const packageJsonPath = join(process.cwd(), 'package.json');
const versionFilePath = join(process.cwd(), 'src/constants/version.ts');

const args = process.argv.slice(2);
let bumpType = args[0];

// Function to prompt user for version type selection
async function promptVersionType(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('\n请选择版本升级类型 (Please select version bump type):');
    console.log('  1) major - 主版本号升级 (Major version bump: x.0.0)');
    console.log('  2) minor - 次版本号升级 (Minor version bump: x.y.0)');
    console.log('  3) patch - 补丁版本号升级 (Patch version bump: x.y.z)');
    console.log('');

    rl.question('请输入选项 (1/2/3): ', (answer) => {
      rl.close();
      const choice = answer.trim().toLowerCase();

      if (choice === '1' || choice === 'major') {
        resolve('major');
      } else if (choice === '2' || choice === 'minor') {
        resolve('minor');
      } else if (choice === '3' || choice === 'patch') {
        resolve('patch');
      } else {
        console.error(
          '❌ 无效的选项，请重新运行脚本 (Invalid choice, please run the script again)',
        );
        process.exit(1);
      }
    });
  });
}

function getVersionFromContent(content: string): string | null {
  const match = content.match(/export const APP_VERSION = '([^']+)';/);
  return match?.[1] ?? null;
}

// Main execution function
async function main() {
  // If no argument provided, prompt user interactively
  if (!bumpType) {
    bumpType = await promptVersionType();
  }

  try {
    // Read files
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const versionFileContent = readFileSync(versionFilePath, 'utf-8');

    // version.ts 是版本号的来源（旧文件可能还带第 4 段 build 号，计算时会忽略）
    const currentFullVersion = getVersionFromContent(versionFileContent);
    const pkgVersion = packageJson.version;

    if (!currentFullVersion) {
      throw new Error('Could not find APP_VERSION in src/constants/version.ts');
    }

    console.log(`Current Package Version: ${pkgVersion}`);
    console.log(`Current App Version (const): ${currentFullVersion}`);

    // Parse current full version
    const parts = currentFullVersion.split('.').map(Number);

    // Validate that all version segments are non-negative integers
    const invalidPart = parts.find((n) => !Number.isFinite(n) || !Number.isInteger(n) || n < 0);
    if (invalidPart !== undefined) {
      throw new Error(
        `Invalid APP_VERSION '${currentFullVersion}' in src/constants/version.ts. Expected only non-negative numeric segments separated by dots.`,
      );
    }

    // Ensure we have at least 3 parts
    while (parts.length < 3) parts.push(0);

    let [major = 0, minor = 0, patch = 0] = parts;

    let newVersionString = '';

    if (bumpType === 'major') {
      major++;
      minor = 0;
      patch = 0;
      newVersionString = `${major}.${minor}.${patch}`;
    } else if (bumpType === 'minor') {
      minor++;
      patch = 0;
      newVersionString = `${major}.${minor}.${patch}`;
    } else if (bumpType === 'patch') {
      patch++;
      newVersionString = `${major}.${minor}.${patch}`;
    } else {
      // Direct set
      if (/^\d+\.\d+(\.\d+)?(\.\d+)?$/.test(bumpType)) {
        // Normalize to exactly 3 parts (semver; 4th segment is no longer stored)
        const versionParts = bumpType.split('.').slice(0, 3);
        while (versionParts.length < 3) {
          versionParts.push('0');
        }
        newVersionString = versionParts.join('.');
        if (newVersionString !== bumpType) {
          console.log(`ℹ️ Normalized version to ${newVersionString} (x.y.z)`);
        }
      } else {
        console.warn('Warning: Version does not look like x.y or x.y.z');
        newVersionString = bumpType;
      }
    }

    packageJson.version = newVersionString;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
    console.log(`✅ Updated package.json to version: ${newVersionString}`);

    // Update src/constants/version.ts
    const newVersionFileContent = `// 应用版本号
// 此文件由 scripts/bump-version.ts 自动生成，请勿手动修改
// 如需更新版本，请运行: bun scripts/bump-version.ts <major|minor|patch|version>
// 界面显示的提交数 / 短 SHA 在构建时注入，见 vite-plugins/build-info.ts
export const APP_VERSION = '${newVersionString}';
`;

    writeFileSync(versionFilePath, newVersionFileContent, 'utf-8');
    console.log(`✅ Updated src/constants/version.ts to version: ${newVersionString}`);
  } catch (error) {
    console.error('❌ Failed to bump version:', error);
    process.exit(1);
  }
}

// Run the main function
main();
