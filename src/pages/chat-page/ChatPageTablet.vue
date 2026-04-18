<script setup lang="ts">
/**
 * Tablet-only dedicated chat page. Three-pane layout matches the handoff
 * mockup: conversation list (240px) · thread (center) · context pane (300px).
 *
 * Chat runtime is `AppRightPanelDesktop` embedded as the center pane with the
 * resize handle hidden and width stretched to fill flex. It already wires
 * `useRightPanel` end-to-end (messages, input, todos, action popovers, session
 * switching). We just wrap it with the surrounding panes.
 *
 * The surrounding layout reads directly from `chatSessionsStore` for the
 * session list and `contextStore` for the context pane — no new store state.
 */
import { computed } from 'vue';
import { useChatSessionsStore } from 'src/stores/chat-sessions';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import AppRightPanelDesktop from 'src/components/layout/AppRightPanelDesktop.vue';

const chatSessionsStore = useChatSessionsStore();
const booksStore = useBooksStore();
const contextStore = useContextStore();

const sessions = computed(() => chatSessionsStore.allSessions);
const currentSession = computed(() => chatSessionsStore.currentSession);

const currentContext = computed(() => contextStore.getContext);

const currentBook = computed(() => {
  const bookId = currentContext.value.currentBookId;
  return bookId ? booksStore.getBookById(bookId) : null;
});

const currentChapterInfo = computed(() => {
  const book = currentBook.value;
  const chapterId = currentContext.value.currentChapterId;
  if (!book || !chapterId || !book.volumes) return null;
  for (const volume of book.volumes) {
    const chapter = volume.chapters?.find((c) => c.id === chapterId);
    if (chapter) {
      const chapterTitle =
        typeof chapter.title === 'string' ? chapter.title : chapter.title?.original ?? '';
      const volumeTitle =
        typeof volume.title === 'string' ? volume.title : volume.title?.original ?? '';
      return { chapterTitle, volumeTitle };
    }
  }
  return null;
});

const sessionPreview = (text: string) => {
  if (!text) return '（无消息）';
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 36 ? `${normalized.slice(0, 36)}…` : normalized;
};

const formatRelativeTime = (timestamp: number) => {
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
};

const switchToSession = (id: string) => {
  chatSessionsStore.switchToSession(id);
};

const createNewSession = () => {
  const ctx = contextStore.getContext;
  chatSessionsStore.createSession({
    bookId: ctx.currentBookId,
    chapterId: ctx.currentChapterId,
    paragraphId: null,
  });
};
</script>

<template>
  <div class="chat-tablet">
    <!-- Left: conversation list -->
    <aside class="ct-sessions">
      <header class="ct-sessions-head">
        <div class="ct-sessions-title">AI 助手</div>
        <div class="ct-sessions-sub">{{ sessions.length }} 个会话</div>
        <button class="ct-new-btn" @click="createNewSession">
          <i class="pi pi-plus" aria-hidden="true" />
          新对话
        </button>
      </header>
      <div class="ct-sessions-body">
        <div v-if="sessions.length === 0" class="ct-sessions-empty">还没有会话，点击「新对话」开始。</div>
        <button
          v-for="s in sessions"
          :key="s.id"
          type="button"
          class="ct-session"
          :class="{ 'ct-session-active': s.id === currentSession?.id }"
          @click="switchToSession(s.id)"
        >
          <div class="ct-session-title">{{ s.title || '未命名会话' }}</div>
          <div class="ct-session-preview">
            {{ sessionPreview(s.messages[s.messages.length - 1]?.content ?? '') }}
          </div>
          <div class="ct-session-meta">{{ formatRelativeTime(s.updatedAt) }}</div>
        </button>
      </div>
    </aside>

    <!-- Center: chat thread (reuses AppRightPanelDesktop) -->
    <div class="ct-center">
      <AppRightPanelDesktop :show-resize-handle="false" />
    </div>

    <!-- Right: context pane -->
    <aside class="ct-context">
      <header class="ct-context-head">
        <div class="ct-context-eyebrow">上下文 · 当前会话</div>
        <div class="ct-context-title">
          {{ currentBook ? currentBook.title : '无上下文' }}
        </div>
      </header>
      <div class="ct-context-body">
        <template v-if="currentBook">
          <div class="ct-context-row">
            <div class="ct-context-label">作者</div>
            <div class="ct-context-value">{{ currentBook.author || '未知' }}</div>
          </div>
          <div v-if="currentChapterInfo" class="ct-context-row">
            <div class="ct-context-label">卷</div>
            <div class="ct-context-value">{{ currentChapterInfo.volumeTitle || '—' }}</div>
          </div>
          <div v-if="currentChapterInfo" class="ct-context-row">
            <div class="ct-context-label">章节</div>
            <div class="ct-context-value">{{ currentChapterInfo.chapterTitle || '—' }}</div>
          </div>
          <div v-if="currentBook.description" class="ct-context-block">
            <div class="ct-context-label">描述</div>
            <p class="ct-context-description">{{ currentBook.description }}</p>
          </div>
        </template>
        <div v-else class="ct-context-empty">
          <i class="pi pi-comments ct-context-empty-icon" aria-hidden="true" />
          <p>打开一本书后，助手会自动看到对应的书籍 / 章节上下文。</p>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.chat-tablet {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: rgba(247, 244, 236, 0.92);
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

/* Sessions (left) */
.ct-sessions {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ct-sessions-head {
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.ct-sessions-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 15px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
}

.ct-sessions-sub {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
}

.ct-new-btn {
  margin-top: 8px;
  width: 100%;
  padding: 7px 10px;
  background: rgba(109, 136, 168, 0.1);
  border: 1px solid rgba(109, 136, 168, 0.28);
  border-radius: 8px;
  color: #bac9db;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background 140ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ct-new-btn:hover {
  background: rgba(109, 136, 168, 0.18);
}

.ct-sessions-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.ct-sessions-empty {
  padding: 16px;
  font-size: 12px;
  color: rgba(247, 244, 236, 0.5);
  text-align: center;
}

.ct-session {
  width: 100%;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: background 140ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ct-session:hover {
  background: rgba(255, 255, 255, 0.04);
}

.ct-session-active {
  border-left-color: #a3b7cf;
  background: rgba(109, 136, 168, 0.08);
}

.ct-session-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ct-session-preview {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.5);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ct-session-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: rgba(247, 244, 236, 0.35);
  margin-top: 3px;
}

/* Center — wraps AppRightPanelDesktop with width overrides so it fills flex */
.ct-center {
  flex: 1;
  min-width: 0;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.ct-center :deep(aside) {
  width: 100% !important;
  border-left: none !important;
  border-right: none !important;
  flex: 1;
  min-width: 0;
}

/* Context pane (right) */
.ct-context {
  width: 300px;
  flex-shrink: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ct-context-head {
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.ct-context-eyebrow {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-weight: 500;
}

.ct-context-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 14px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.ct-context-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 18px;
}

.ct-context-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.ct-context-row:last-child {
  border-bottom: none;
}

.ct-context-label {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  width: 52px;
  flex-shrink: 0;
  padding-top: 2px;
}

.ct-context-value {
  font-size: 12px;
  color: rgba(247, 244, 236, 0.85);
  flex: 1;
  min-width: 0;
}

.ct-context-block {
  margin-top: 14px;
}

.ct-context-description {
  font-size: 12px;
  color: rgba(247, 244, 236, 0.7);
  line-height: 1.6;
  margin: 6px 0 0;
}

.ct-context-empty {
  padding: 40px 16px;
  text-align: center;
  color: rgba(247, 244, 236, 0.5);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.ct-context-empty-icon {
  font-size: 26px;
  color: rgba(247, 244, 236, 0.3);
}
</style>
