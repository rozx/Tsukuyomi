import { spawnSync } from 'child_process';
import { existsSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

function runCommand(command, args) {
  console.log(`Executing: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  if (result.error) {
    console.error(`Error: ${result.error.message}`);
    return false;
  }
  return result.status === 0;
}

async function setup() {
  const isWindows = process.platform === 'win32';
  const setupScript = isWindows
    ? join(projectRoot, 'scripts', 'setup-git-hooks.ps1')
    : join(projectRoot, 'scripts', 'setup-git-hooks.sh');

  if (!existsSync(setupScript)) {
    console.error(`Setup script not found: ${setupScript}`);
    process.exit(1);
  }

  if (isWindows) {
    console.log('Detected Windows, running PowerShell setup...');
    const success = runCommand('powershell', ['-ExecutionPolicy', 'Bypass', '-File', setupScript]);
    process.exit(success ? 0 : 1);
  } else {
    console.log('Detected Mac/Linux, running shell setup...');
    // Ensure the setup script is executable
    try {
      chmodSync(setupScript, '755');
      // Also ensure the hook itself is executable, as scripts/setup-git-hooks.sh will do this too
      const hookPath = join(projectRoot, '.githooks', 'pre-commit');
      if (existsSync(hookPath)) {
        chmodSync(hookPath, '755');
      }
    } catch (err) {
      console.warn(`Warning: Could not set executable permissions: ${err.message}`);
    }

    const success = runCommand('bash', [setupScript]);
    process.exit(success ? 0 : 1);
  }
}

setup();
