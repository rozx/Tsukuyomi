#!/usr/bin/env bun
/**
 * Bump version in package.json and src/constants/version.ts
 * Usage: bun scripts/bump-version.ts <major|minor|patch|build|version>
 * Examples:
 *   bun scripts/bump-version.ts major     - Bump major version (e.g., 0.8.4.5 -> 1.0.0.0)
 *   bun scripts/bump-version.ts minor     - Bump minor version (e.g., 0.8.4.5 -> 0.9.0.0)
 *   bun scripts/bump-version.ts patch     - Bump patch version (e.g., 0.8.4.5 -> 0.8.5.0)
 *   bun scripts/bump-version.ts build     - Bump build version (e.g., 0.8.4.5 -> 0.8.4.6)
 *   bun scripts/bump-version.ts 0.5.18    - Set version directly
 *
 * Note: When bumping major/minor/patch, build number is reset to 0
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
    console.log('  1) major - 主版本号升级 (Major version bump)');
    console.log('  2) minor - 次版本号升级 (Minor version bump)');
    console.log('  3) patch - 补丁版本号升级 (Patch version bump)');
    console.log('  4) build - 构建号升级 (Build version bump)');
    console.log('');

    rl.question('请输入选项 (1/2/3/4): ', (answer) => {
      rl.close();
      const choice = answer.trim().toLowerCase();

      if (choice === '1' || choice === 'major') {
        resolve('major');
      } else if (choice === '2' || choice === 'minor') {
        resolve('minor');
      } else if (choice === '3' || choice === 'patch') {
        resolve('patch');
      } else if (choice === '4' || choice === 'build') {
        resolve('build');
      } else {
        console.error(
          '❌ 无效的选项，请重新运行脚本 (Invalid choice, please run the script again)',
        );
        process.exit(1);
      }
    });
  });
}

// Main execution function
async function main() {
  // If no argument provided, prompt user interactively
  if (!bumpType) {
    bumpType = await promptVersionType();
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
    // Support versions with 2 parts (x.y), 3 parts (x.y.z), or 4 parts (x.y.z.build)
    const versionRegex = /^\d+\.\d+(\.\d+)?(\.\d+)?$/;

    if (!versionRegex.test(cleanVersion)) {
      throw new Error(
        `Invalid version format in package.json: "${version}". ` +
          `Expected format: x.y, x.y.z, or x.y.z.build (e.g., "0.5", "0.5.18", or "0.5.18.1"). ` +
          `Current version must be a valid semver format before bumping.`,
      );
    }

    const parts = cleanVersion.split('.');
    // Normalize 2-part versions to 3-part by appending patch version 0
    if (parts.length === 2) {
      parts.push('0');
    }
    const [major, minor, patch] = parts.map(Number);
    const build = parts.length > 3 ? Number(parts[3]) : 0;

    // Validate parsed numbers are not NaN
    if (isNaN(major) || isNaN(minor) || isNaN(patch) || isNaN(build)) {
      throw new Error(
        `Failed to parse version "${version}". ` +
          `Parsed values: major=${major}, minor=${minor}, patch=${patch}, build=${build}. ` +
          `Please ensure the version is in x.y, x.y.z, or x.y.z.build format.`,
      );
    }

    if (bumpType === 'major') {
      version = `${major + 1}.0.0.0`;
    } else if (bumpType === 'minor') {
      version = `${major}.${minor + 1}.0.0`;
    } else if (bumpType === 'patch') {
      version = `${major}.${minor}.${patch + 1}.0`;
    } else if (bumpType === 'build') {
      version = `${major}.${minor}.${patch}.${build + 1}`;
    } else {
      // Validate version string if it looks like a version (support x.y, x.y.z, or x.y.z.build)
      if (/^\d+\.\d+(\.\d+)?(\.\d+)?$/.test(bumpType)) {
        version = bumpType;
        // Normalize 2-part versions to 3-part format
        const versionParts = version.split('.');
        if (versionParts.length === 2) {
          version = `${version}.0`;
        }
      } else {
        // Allow setting arbitrary version string if needed, but warn
        console.warn('Warning: Version does not look like x.y, x.y.z, or x.y.z.build');
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
// 如需更新版本，请运行: bun scripts/bump-version.ts <major|minor|patch|build|version>
export const APP_VERSION = '${version}';
`;

    writeFileSync(versionFilePath, versionFileContent, 'utf-8');
    console.log(`✅ Updated src/constants/version.ts to version: ${version}`);
  } catch (error) {
    console.error('❌ Failed to bump version:', error);
    process.exit(1);
  }
}

// Run the main function
main();
