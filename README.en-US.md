# Tsukuyomi (月詠) - Moonlit Translator

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | **English**

![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg) ![GitHub Release](https://img.shields.io/github/v/release/rozx/Tsukuyomi) ![Vue](https://img.shields.io/badge/Vue.js-3.5-4FC08D?logo=vue.js&logoColor=white) ![Quasar](https://img.shields.io/badge/Quasar-2.20-1976D2?logo=quasar&logoColor=white) ![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white) ![Bun](https://img.shields.io/badge/Bun-1.0%2B-000000?logo=bun&logoColor=white)

[![Github All Releases](https://img.shields.io/github/downloads/rozx/Tsukuyomi/total.svg)](https://github.com/rozx/Tsukuyomi/releases)

![GitHub stars](https://img.shields.io/github/stars/rozx/Tsukuyomi?style=social) ![GitHub forks](https://img.shields.io/github/forks/rozx/Tsukuyomi?style=social) ![GitHub issues](https://img.shields.io/github/issues/rozx/Tsukuyomi) ![GitHub last commit](https://img.shields.io/github/last-commit/rozx/Tsukuyomi) ![GitHub repo size](https://img.shields.io/github/repo-size/rozx/Tsukuyomi)

<img width="192" height="192" alt="android-chrome-192x192" src="https://github.com/user-attachments/assets/80e77fc0-9aa6-4900-9b5f-7420672a12a4" />

> An AI-powered tool for importing, reading, and translating novels: any source language, translated into Simplified Chinese, Traditional Chinese, or English, with dedicated support for Japanese web novels and light novels.

**Tsukuyomi (月詠)** brings novel import, bilingual reading, translation, polishing, and proofreading into one workspace. Bring your own API key for OpenAI, Gemini, or any OpenAI-compatible service, and give the AI context through terminology, character settings, and a memory bank. Available as a web app and an Electron desktop app.

- [Open the web app](https://tsukuyomi.rozx.moe/)
- [Download the desktop app](https://github.com/rozx/Tsukuyomi/releases/latest)

## 🌐 New in v0.17: Three-Language UI and Per-Book Target Language

The interface, help docs, and README are available in Simplified Chinese, Traditional Chinese, and English. Each book now has its own translation target language, and source text is no longer limited to Japanese.

- **Interface language**: switch it under Settings → General → Interface language. On first launch it matches your system language, and the preference syncs with your settings.
- **Per-book target language**: choose Simplified Chinese, Traditional Chinese, or English in the book's Translation settings. New books start with the interface language at creation time. Translations, volume and chapter titles, and term / character names are stored per language and never overwrite each other.
- **Any source language**: the AI detects the source language paragraph by paragraph; paragraphs already in the target language can be kept as-is.
- **Firecrawl fetch fallback**: when a site blocks proxy access, fetching falls back to Firecrawl (works without a key), replacing the old automatic proxy switching. Book update checks now read only the catalog and compare chapter text on demand.
- **Sync protocol v6**: book metadata and chapter content sync separately. Chapters use stable groups based on their IDs, so adding or editing one chapter normally uploads only its group, changed metadata, and the manifest. Entity deletion protection and local-only memory access times are preserved. Manifest-based reads support libraries with more than 300 sync files. **For multiple devices, back up first, upgrade every device to a version supporting v6, then sync them one at a time. The first upgrade performs a full migration.**

[v0.17.0 release notes (Simplified Chinese)](public/releaseNotes/RELEASE_NOTES_v0.17.0.md) · [Settings guide](public/help/en-US/settings-guide.md)

![Tsukuyomi Dashboard](public/screenshots/desktop-index.png)

## ✨ Features

### 🌐 Multilingual Translation

- **Any source language**: the AI detects the source language paragraph by paragraph, so one book can mix languages; paragraphs already in the target language can be kept as-is.
- **Per-book target language**: each book translates into Simplified Chinese, Traditional Chinese, or English. New books default to the current interface language.
- **Separate translations per language**: paragraph translations, volume/chapter titles, and term and character renderings are stored per target language, so switching targets never overwrites existing work.
- **Three-language interface and help**: the interface and help docs are available in Simplified Chinese, Traditional Chinese, and English.

### 🤖 AI Model Configuration

Tsukuyomi is Bring Your Own Key, with two built-in providers:

- **OpenAI**: enter an API key, base URL, and model ID. Also works with OpenAI-compatible services and gateways.
- **Gemini**: connects through the Google Generative AI SDK with an API key and model ID.

Other models connect through a supported compatible API; which models and tool-calling features work depends on the service. From the UI you can fetch the model list, test the connection, and configure custom request headers and a browser CORS proxy.

Translation, proofreading/polishing, term translation, and the assistant each have their own default model, and a single book can override its translation and proofreading/polishing models. See [AI model configuration](public/help/en-US/ai-models-guide.md).

### 📚 Translation and Reading

Read, edit, and process chapters on the book details page:

- **Side-by-side view**: compare source and translation paragraph by paragraph, with translation, source editing, and translation preview modes.
- **End-to-end AI tasks**:
  - **Translate**: produces a translation using terminology, character settings, and retrieved context.
  - **Polish**: removes stiff "translationese" so the text reads naturally in the target language.
  - **Proofread**: checks for omissions, typos, and formatting problems.
- **Multiple versions**: try different models on the same paragraph and switch between versions to keep the best one.
- **Task progress**: follow translation progress, to-dos, the thinking/output timeline, and tool-call details.

### 🧩 Context Engine

Terminology, character settings, memories, and chapter search give the AI context beyond the current paragraph:

#### 1. 📖 Glossary

- **Consistent renderings**: record one translation for each place name, skill name, or special term for translation tasks to use.
- **Meaning hints**: add a description so the AI understands what the term does in the story.

#### 2. 👥 Character Settings

- **Attributes**: define each character's **gender**, **tone**, **verbal tics**, and **personality**.
- **Aliases**: build an alias list so the AI knows that "the hero", "that guy", and "Satou" are the same person.
- **Voice reference**: pass each character's voice and personality to the AI to keep dialogue consistent.

#### 3. 🧠 Memory Bank

- **World-building notes**: record complex factions, magic-system rules, and key foreshadowing.
- **Semantic-first memory retrieval**: when embeddings are available, memories are scored by semantic similarity, keyword match, and time decay (weights 0.85 / 0.10 / 0.05). When embeddings are off or unavailable, scoring falls back to keywords and time decay (0.75 / 0.25). Scores are normalized to 0–1.0 and the most relevant memories are injected within a character budget.
- **Local semantic embeddings (optional)**: a built-in `gte-multilingual-base` multilingual encoder (Transformers.js) runs on WebGPU + q4f16, falling back to WASM + int8 when unsupported. Embeddings are computed locally and use no AI API quota. Off by default; enable it under **Settings → Local embeddings**. Disabled on physical mobile devices.
- **Hybrid search**: the `search_memories` tool accepts natural-language queries and ranks results by both keyword match and semantic vectors; with embeddings off it falls back to keywords + time decay.

#### 4. 📑 Chapter Vector Index

- **Multi-vector chapter index**: with local embeddings enabled, each chapter gets a native 768-dimension multi-vector index split at paragraph boundaries of about 100 characters, plus a dedicated vector for "chapter title + first paragraph" to support title, series, and topic queries.
- **`query_chapter` hybrid search**: the AI can search source text across chapters in natural language. Semantic confidence is calibrated per chapter and fused with keyword ranks via RRF, then results are ranked by `0.85 × semantic + 0.15 × keyword` and weak matches are filtered out. The translate, polish, proofread, and chat assistant prompts all use this tool to pull in earlier context.
- **Bulk management**: in book details, the **Vector index** panel shows index records, rebuilds and recomputes in bulk, and lets you test queries. See [Local embeddings](public/help/en-US/local-embedding.md).

### 💬 AI Chat Assistant

Tsukuyomi answers questions with the current book as context and can act through tools:

- **On-the-spot help**: ask "What's the joke in this line?" or "How do I keep the author's playful tone here?"
- **Hands-free edits**: change book details or add and remove terms just by asking, e.g. "Mark this book as completed."
- **Built-in knowledge base**: for questions about the app, the AI searches the official help docs.

### ☁️ Cross-Device Sync

- **Gist cloud sync**: optionally sync your data to your own GitHub Gist, with revision history and restore from usable snapshots.
- **Incremental manifest sync**: `manifest.json` with SHA-256 hashes picks out changed entries, and conditional requests cut down downloads. ETags are re-checked before upload; concurrent changes trigger a re-merge and retry.
- **Consistent deletes**: the manifest carries deletions as tombstones, so an entry deleted on device A is not pushed back by device B.
- **In-book deletion records**: terms, characters, and aliases have stable identities, and their deletion records stay with the book; deleted translation versions are recorded too, so devices returning from offline cannot resurrect them.
- **Paragraph merging**: with a synced structural baseline, source edits and deletions made on one side are kept; translations are merged only for paragraphs whose source matches, and you are asked to review conflicts when both sides changed the structure.
- **Force push**: replace the remote data with a local snapshot, after checking the source device and target Gist.

### 📱 Every Device

- **Desktop / tablet / mobile**: a dispatcher + three-variant architecture keeps desktop information-dense, gives tablets a two-pane reader with a dockable AI assistant, and gives phones a native-feeling bottom tab bar + bottom sheets.
- **Electron desktop app**: one codebase builds both the web SPA and cross-platform desktop clients; the desktop app always uses the Desktop variant.

## 📸 Screenshots

The screenshots below show the home page, library, reader, and model management on desktop, tablet, and phone.

### 🏠 Home · Dashboard

![Desktop home](public/screenshots/desktop-index.png)

|                                      Tablet                                      |                                      Mobile                                      |
| :------------------------------------------------------------------------------: | :------------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-index.png" alt="Tablet home" width="100%" /> | <img src="public/screenshots/mobile-index.png" alt="Mobile home" width="100%" /> |

### 📚 Library

![Desktop library](public/screenshots/desktop-library.png)

|                                        Tablet                                         |                                        Mobile                                         |
| :-----------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-library.png" alt="Tablet library" width="100%" /> | <img src="public/screenshots/mobile-library.png" alt="Mobile library" width="100%" /> |

### 📖 Book Details & Reader

> Desktop and tablet use a two-pane layout that combines the chapter tree, metadata, and paragraph reader in one view; on phones these are split into separate pages to fit portrait screens.

![Desktop book details](public/screenshots/desktop-book-details.png)

|                                             Tablet                                              |                                      Mobile (book details)                                      |                                   Mobile (reader)                                   |
| :---------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-book-details.png" alt="Tablet book details" width="100%" /> | <img src="public/screenshots/mobile-book-details.png" alt="Mobile book details" width="100%" /> | <img src="public/screenshots/mobile-reader.png" alt="Mobile reader" width="100%" /> |

### 💬 Reader + Chat Workspace

The right panel is dockable, so the AI assistant is always one click away. With local embeddings enabled, the `query_chapter` / `search_memories` tools retrieve context across chapters and memories.

![Desktop reader + AI assistant](public/screenshots/desktop-reader-with-chat.png)

|                                                    Tablet                                                    |                                               Mobile                                                |
| :----------------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-reader-with-chat.png" alt="Tablet reader + AI assistant" width="100%" /> | <img src="public/screenshots/mobile-reader-with-chat.png" alt="Mobile AI assistant" width="100%" /> |

### 🤖 Model Management

![Desktop AI models](public/screenshots/desktop-ai-models.png)

|                                          Tablet                                           |                                          Mobile                                           |
| :---------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------: |
| <img src="public/screenshots/tablet-ai-models.png" alt="Tablet AI models" width="100%" /> | <img src="public/screenshots/mobile-ai-models.png" alt="Mobile AI models" width="100%" /> |

## 🔒 Privacy and Data Ownership

Local storage, AI requests, and cloud sync each handle data differently:

- **Local storage**: books, translations, terms, memories, settings, and import tasks are stored by default in IndexedDB in the current browser or the Electron data directory. Saved content can be read and edited locally; remote AI, web scraping, web search, and Gist sync need a network connection.
- **AI requests**: translation, chat, and AI import send the required text and context to the model service you configured. In the browser a CORS proxy is on by default and can be turned off per model; Electron sends AI requests directly to the configured endpoint.
- **Keys and sync scope**: model API keys are stored locally with the model settings and, with Gist sync enabled, are synced along with them. The GitHub sync token stays on the current device and is never written to the sync payload. The app does not add extra encryption to these local credentials.
- **Local semantic embeddings**: with **Local embeddings** enabled, the memory bank and chapter index run Transformers.js inside the browser / Electron and **never upload text to an external embedding service**. Model files are cached in the browser's Cache Storage after download.
- **Optional Gist cloud sync**: syncs books, memories, models, covers, and app settings. AI import tasks and intermediate drafts stay on the current device; books sync normally once the import is confirmed.

## 🚀 Getting Started

### 1. Open the app and set up models

Use the [web app](https://tsukuyomi.rozx.moe/) or [download the desktop app](https://github.com/rozx/Tsukuyomi/releases/latest); no need to clone the source. Open **AI models**, add your models, and choose defaults for translation, proofreading/polishing, and the assistant. The AI import workspace uses the **Assistant** default model.

### 2. Import a novel

1. Open **AI import** and choose **New task**.
2. In **Sources**, add a novel URL, or select / drop TXT, Markdown, HTML, or EPUB files.
3. In the chat, describe what to import and how to split volumes and chapters, then let Tsukuyomi organize it.
4. In **Volume/chapter draft**, check the book details, chapter order, and text.
5. Generate an **Import plan**, check the target book, missing chapters, and translation impact, then choose **Confirm import**. When it finishes, choose **Open novel**.

See the [AI import workspace guide](public/help/en-US/import-guide.md) for more examples. You can also choose **Import from website** in the library to use the built-in rules for the Japanese novel sites `ncode.syosetu.com`, `novel18.syosetu.com`, `kakuyomu.jp`, and `syosetu.org`; other sites can be handed to the AI importer. App-format JSON book files can be added with **Import from JSON**, and full backups are restored from Settings.

### 3. Run from source

The project is built with [Bun](https://bun.sh):

```bash
# Clone the repository
git clone https://github.com/rozx/Tsukuyomi.git
cd Tsukuyomi

# Install dependencies
bun install

# Register the commit hook after the first clone (bumps the build number on commit)
bun run setup:git-hooks

# Start the dev environment
bun run dev
```

`bun run dev` starts the Quasar/Vite dev server at `http://localhost:9000` by default; set the `PORT` environment variable to change the port. For Electron development, use `bun run dev:electron`.

## 📖 Documentation

| Category          | Guides (in `public/help/en-US`)                                                                                                                                                                     |
| :---------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Basics**        | [Quick start](public/help/en-US/front-page.md) \| [AI models](public/help/en-US/ai-models-guide.md) \| [Settings and sync](public/help/en-US/settings-guide.md)                                     |
| **Books**         | [Library and home](public/help/en-US/library-guide.md) \| [Import and scraping](public/help/en-US/books-page-guide.md) \| [Chapter management](public/help/en-US/book-details-chapters.md)          |
| **Translation**   | [Translation panel](public/help/en-US/book-details-translation.md) \| [Editing modes](public/help/en-US/book-details-editing.md) \| [System bar and navigation](public/help/en-US/toolbar-guide.md) |
| **Context**       | [Terminology](public/help/en-US/book-details-terminology.md) \| [Character settings](public/help/en-US/book-details-characters.md) \| [Memory](public/help/en-US/book-details-memory.md)            |
| **AI import**     | [Import workspace: steps, splitting, and adding chapters](public/help/en-US/import-guide.md)                                                                                                        |
| **Advanced**      | [Chat assistant](public/help/en-US/chat-assistant-guide.md) \| [Local embeddings and chapter search](public/help/en-US/local-embedding.md)                                                          |
| **Release notes** | [v0.17.0 release notes (Simplified Chinese)](public/releaseNotes/RELEASE_NOTES_v0.17.0.md)                                                                                                          |

> The in-app **Help** page has the user guides; docs on the main branch are synced to the [GitHub Wiki](https://github.com/rozx/Tsukuyomi/wiki) by a workflow.

## 🧱 Tech Stack

| Layer                 | Technology                                                                                                                   |
| :-------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**          | Vue 3.5 · Quasar 2.20 · TypeScript 5.9 · Pinia 3 · PrimeVue 4.5 · Tailwind CSS 3.4 · Vue-i18n (zh-CN / zh-TW / en-US)        |
| **Desktop**           | Electron 39 (the web SPA and desktop app share one codebase; `useDeviceVariant` forces the Desktop variant)                  |
| **Runtime / build**   | Bun ≥ 1.0 · Vite · Quasar CLI                                                                                                |
| **AI SDK**            | OpenAI SDK · Google Generative AI; compatible services connect through the OpenAI provider (BYOK)                            |
| **Local embeddings**  | Transformers.js (ONNX Runtime Web) · `gte-multilingual-base` · 768-dim · WebGPU + q4f16 (preferred) / WASM + int8 (fallback) |
| **Storage / sync**    | IndexedDB (`idb`) · GitHub Gist (`@octokit/rest`) · SHA-256 hash manifest · conditional GET + pseudo-CAS concurrency guard   |
| **Scraping**          | Puppeteer + `puppeteer-extra-plugin-stealth` (Electron desktop) / CORS proxy (web) · Firecrawl fallback when blocked         |
| **AI import**         | Tool calls organize drafts · Web Worker file parsing · EPUB/ZIP (fflate) · Web Locks for cross-tab exclusion                 |
| **Testing / quality** | Vitest (jsdom) · fake-indexeddb · Istanbul coverage · ESLint · vue-tsc · Fallow                                              |

## 🛠️ Development and Build

| Command                   | Purpose                                                                                       |
| :------------------------ | :-------------------------------------------------------------------------------------------- |
| `bun install`             | Install dependencies                                                                          |
| `bun run setup:git-hooks` | Register the pre-commit build-number hook after the first clone                               |
| `bun run dev`             | Start the web dev server (port 9000 by default)                                               |
| `bun run dev:electron`    | Start Electron dev mode                                                                       |
| `bun run build:spa`       | Build the production web SPA                                                                  |
| `bun run build:electron`  | Package desktop clients per platform (macOS: dmg/zip; Windows: portable exe; Linux: AppImage) |
| `bun run lint`            | Lint the code                                                                                 |
| `bun run type-check`      | TypeScript type check                                                                         |
| `bun run quality-check`   | Fallow analysis and diff-scoped CI gate                                                       |
| `bun run format`          | Format with Prettier                                                                          |
| `bun run test`            | Run the test suite with Vitest                                                                |
| `bun run test:watch`      | Vitest watch mode                                                                             |
| `bun run test:coverage`   | Run tests and produce Istanbul coverage                                                       |
| `bun bump <version>`      | Bump the release version, e.g. `bun bump 0.16.0`                                              |

**Developer docs (Simplified Chinese)**: [Build troubleshooting](docs/BUILD_TROUBLESHOOTING.md) \| [Theme guide](docs/THEME_GUIDE.md) \| [Translation guide](docs/TRANSLATION_GUIDE.md) \| [Wiki sync](docs/WIKI_SYNC.md) \| [Contributor guide](AGENTS.md) \| [Project conventions (Claude Code)](CLAUDE.md)

## 🤝 Contributing

Issues, PRs, and feedback on the translator are welcome. Before submitting code:

1. Run `bun run lint && bun run type-check && bun run quality-check`.
2. New features, bug fixes, and runtime logic changes follow TDD: write a failing test first, then implement until it passes. Tests live in `src/__tests__/` and run with `bun run test`; docs-, style-, and config-only changes do not need new tests.
3. Verify UI changes at the desktop, tablet, and phone breakpoints, following the device-variant rules in [AGENTS.md](AGENTS.md).

## 📄 License

[Apache License 2.0](LICENSE) — free for personal and commercial use; please keep the copyright notice when redistributing.

---

> _Tsukuyomi — may every page turn flow like moonlight._
