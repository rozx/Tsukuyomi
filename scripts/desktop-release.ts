import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, rm, mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { VelopackAsset } from 'velopack';

const TITLE = 'Tsukuyomi - Moonlit Translator';
const VPK_VERSION = '1.2.158';

export function releasePlan(platform: string, arch: string, version: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('发布版本必须为三段正式版本号');
  const os = { win32: 'win', darwin: 'osx', linux: 'linux' }[platform];
  if (!os || !['x64', 'arm64'].includes(arch)) throw new Error('不支持的桌面构建目标');
  const channel = `${os}-${arch}`;
  const base = join('dist/electron/Packaged', `${TITLE}-${platform}-${arch}`);
  const packDir = platform === 'darwin' ? join(base, `${TITLE}.app`) : base;
  const args = [
    'pack',
    '--packId',
    'tsukuyomi',
    '--packVersion',
    version,
    '--packDir',
    packDir,
    '--packTitle',
    TITLE,
    '--packAuthors',
    'rozx',
    '--channel',
    channel,
    '--runtime',
    channel,
    '--outputDir',
    'dist/electron/Releases',
    '--mainExe',
    `${TITLE}${platform === 'win32' ? '.exe' : ''}`,
    '--delta',
    'None',
  ];
  if (platform === 'darwin')
    args.push(
      '--noInst',
      '--signAppIdentity',
      '-',
      '--signEntitlements',
      'src-electron/mac.entitlements',
    );
  else if (platform === 'win32') args.push('--noInst', '--icon', 'src-electron/icons/icon.ico');
  else args.push('--icon', 'src-electron/icons/icon.png');
  return { channel, packDir, args };
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export async function validateReleaseAssets(dir: string, version: string, channels: string[]) {
  const files = await readdir(dir);
  for (const channel of channels) {
    const feed = JSON.parse(await readFile(join(dir, `releases.${channel}.json`), 'utf8')) as {
      Assets?: VelopackAsset[];
    };
    if (!feed.Assets?.length) throw new Error(`${channel} 缺少更新资产`);
    const full = feed.Assets.filter((asset) => asset.Type === 'Full' && asset.Version === version);
    if (full.length !== 1) throw new Error(`${channel} 发布版本不匹配`);
    for (const asset of feed.Assets) {
      if (
        asset.PackageId !== 'tsukuyomi' ||
        asset.Version !== version ||
        !asset.FileName ||
        basename(asset.FileName) !== asset.FileName ||
        asset.FileName.includes('\\') ||
        !asset.FileName.endsWith('.nupkg')
      ) {
        throw new Error(`${channel} 更新包身份或路径无效`);
      }
      const path = join(dir, asset.FileName);
      if (
        (await stat(path)).size !== asset.Size ||
        (await sha256(path)).toLowerCase() !== asset.SHA256?.toLowerCase()
      ) {
        throw new Error(`${channel} 更新包校验失败：${asset.FileName}`);
      }
    }
    const suffix = channel.startsWith('linux-') ? '.AppImage' : '-Portable.zip';
    if (!files.some((name) => name.includes(channel) && name.endsWith(suffix))) {
      throw new Error(`${channel} 缺少便携分发包`);
    }
  }
}

function run(command: string, args: string[], env = process.env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} 执行失败 (${result.status})`);
}

async function main() {
  const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
    version: string;
    dependencies: Record<string, string>;
  };
  if (pkg.dependencies.velopack !== VPK_VERSION) throw new Error('velopack 与 vpk 版本必须一致');
  if (process.argv[2] === 'verify') {
    const [, , , dir, version, ...channels] = process.argv;
    if (!dir || !version || !channels.length) throw new Error('需要目录、版本和通道');
    await validateReleaseAssets(dir, version, channels);
    return;
  }
  const plan = releasePlan(process.platform, process.arch, pkg.version);
  // 不继承历史签名 secrets，避免无证书构建误入 keychain / 公证流程。
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('CSC_') || key.startsWith('APPLE_') || key.startsWith('VPK_'))
      delete env[key];
  }
  env.PUPPETEER_SKIP_DOWNLOAD = 'true';
  if (process.argv[2] !== 'pack') run('bun', ['run', 'build:electron:app'], env);
  const output = resolve('dist/electron/Releases');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  // 可指定本地已安装的同版本工具；CI 默认使用固定版本 dnx。
  if (process.env.TSUKUYOMI_VPK) {
    const result = spawnSync(process.env.TSUKUYOMI_VPK, ['-H'], { encoding: 'utf8', env });
    if (result.status !== 0 || !result.stdout.includes(VPK_VERSION))
      throw new Error('本地 vpk 版本不匹配');
    run(process.env.TSUKUYOMI_VPK, ['--yes', ...plan.args], env);
  } else run('dotnet', ['dnx', 'vpk', '--version', VPK_VERSION, '--', '--yes', ...plan.args], env);
  await validateReleaseAssets(output, pkg.version, [plan.channel]);
}

if (import.meta.main) await main();
