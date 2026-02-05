#!/usr/bin/env bun
/**
 * Bump version in package.json and src/constants/version.ts
 * Usage: bun scripts/bump-version.ts <major|minor|patch|build|version>
 * Examples:
 *   bun scripts/bump-version.ts major     - Bump major version (e.g., 0.8.4.5 -> 1.0.0)
 *   bun scripts/bump-version.ts minor     - Bump minor version (e.g., 0.8.4.5 -> 0.9.0)
 *   bun scripts/bump-version.ts patch     - Bump patch version (e.g., 0.8.4.5 -> 0.8.5)
 *   bun scripts/bump-version.ts build     - Bump build version (e.g., 0.8.4.5 -> 0.8.4.6) DOES NOT UPDATE package.json
 *   bun scripts/bump-version.ts 0.5.18    - Set version directly
 *
 * Note: When bumping major/minor/patch, build number is reset to 0 and stripped from package.json
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
    console.log(
      '  4) build - 构建号升级 (Build bump: x.y.z.w) - ONLY updates constants/version.ts',
    );
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

    // We use the version file as the source of truth for the FULL version (including build)
    const currentFullVersion = getVersionFromContent(versionFileContent);
    const pkgVersion = packageJson.version;

    if (!currentFullVersion) {
      throw new Error('Could not find APP_VERSION in src/constants/version.ts');
    }

    console.log(`Current Package Version: ${pkgVersion}`);
    console.log(`Current App Version (const): ${currentFullVersion}`);

    // Parse current full version
    const parts = currentFullVersion.split('.').map(Number);
    // Ensure we have at least 3 parts
    while (parts.length < 3) parts.push(0);

    let [major = 0, minor = 0, patch = 0] = parts;
    let build = parts[3] ?? 0;

    let newVersionString = '';
    let shouldUpdatePackageJson = true;

    if (bumpType === 'major') {
      major++;
      minor = 0;
      patch = 0;
      build = 0;
      newVersionString = `${major}.${minor}.${patch}`;
    } else if (bumpType === 'minor') {
      minor++;
      patch = 0;
      build = 0;
      newVersionString = `${major}.${minor}.${patch}`;
    } else if (bumpType === 'patch') {
      patch++;
      build = 0;
      newVersionString = `${major}.${minor}.${patch}`;
    } else if (bumpType === 'build') {
      build++;
      newVersionString = `${major}.${minor}.${patch}.${build}`;
      shouldUpdatePackageJson = false; // Don't update package.json for build bumps
    } else {
      // Direct set
      if (/^\d+\.\d+(\.\d+)?(\.\d+)?$/.test(bumpType)) {
        newVersionString = bumpType;
        // logic to decide if we update package.json?
        // If it has 4 parts, we probably shouldn't set that to package.json to avoid errors
        if (newVersionString.split('.').length > 3) {
          console.warn(
            '⚠️ New version has 4 components. Updating ONLY version.ts to avoid electron-builder errors.',
          );
          shouldUpdatePackageJson = false;
        }
      } else {
        console.warn('Warning: Version does not look like x.y, x.y.z, or x.y.z.build');
        newVersionString = bumpType;
      }
    }

    // Update package.json if needed
    if (shouldUpdatePackageJson) {
      packageJson.version = newVersionString;
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
      console.log(`✅ Updated package.json to version: ${newVersionString}`);
    } else {
      console.log(`ℹ️ Skipping package.json update (keeping ${pkgVersion})`);
    }

    // Update src/constants/version.ts
    const newVersionFileContent = `// 应用版本号
// 此文件由 scripts/bump-version.ts 自动生成，请勿手动修改
// 如需更新版本，请运行: bun scripts/bump-version.ts <major|minor|patch|build|version>
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
