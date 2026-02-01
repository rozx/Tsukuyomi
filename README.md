# Tsukuyomi月咏 - Moonlit Translator

Tsukuyomi - Moonlit Translator

## Install the dependencies

```bash
bun install
```

### Start the app in development mode (hot-code reloading, error reporting, etc.)

```bash
bun run dev
```

### Lint the files

```bash
bun run lint
```

### Format the files

```bash
bun run format
```

### Build the app for production

```bash
bun run build
```

### Build SPA for production

```bash
bun run build:spa
```

### Build Electron desktop app

```bash
bun run build:electron
```

## Version Management

### Bump Version Manually

The project supports automatic version bumping with the following options:

```bash
# Bump major version (e.g., 0.8.4.5 -> 1.0.0.0)
bun run bump major

# Bump minor version (e.g., 0.8.4.5 -> 0.9.0.0)
bun run bump minor

# Bump patch version (e.g., 0.8.4.5 -> 0.8.5.0)
bun run bump patch

# Bump build version (e.g., 0.8.4.5 -> 0.8.4.6)
bun run bump build

# Set specific version directly
bun run bump 0.9.0
```

**Note:** When bumping major, minor, or patch versions, the build number is automatically reset to 0.

### Setup Git Hooks (Auto Bump Build Version on Commit)

To automatically bump the build version on every git commit:

```bash
# Setup git hooks (works on Windows, macOS, and Linux)
bun run setup:git-hooks
```

After running this command, every time you run `git commit`, the build version will be automatically incremented (e.g., `0.8.4.5` -> `0.8.4.6`), and the updated `package.json` and `src/constants/version.ts` files will be staged automatically.

To disable the auto-bump hook:

```bash
git config --unset core.hooksPath
```

**Note:** The setup script automatically detects your operating system and uses the appropriate script (PowerShell for Windows, Bash for macOS/Linux).

### Customize the configuration

See [Configuring quasar.config.js](https://v2.quasar.dev/quasar-cli-vite/quasar-config-js).
