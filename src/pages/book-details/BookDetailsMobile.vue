<script setup lang="ts">
/**
 * 手机端书籍详情变体（dispatcher 内部）。
 *
 * 按 selectedChapter 在 Overview（卷/章节/术语/角色/记忆 概览）与 Reader（阅读器）
 * 之间切换。两者各自承载独立的 UI 状态与 picker，共用 injectBookDetailsPage() 上下文。
 *
 * 注意：本文件保留全部手机端样式（非 scoped），因为 mbd- / mbr- 前缀仅在本页使用，
 * 抽出的子组件（Overview / Reader / ChapterTree / ParagraphList / ParagraphMeta）
 * 作为后代元素可直接命中这些全局类，避免跨组件 scoped 样式失效。
 */
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import BookDetailsMobileOverview from './BookDetailsMobileOverview.vue';
import BookDetailsMobileReader from './BookDetailsMobileReader.vue';

const ctx = injectBookDetailsPage();
</script>

<template>
  <BookDetailsMobileOverview v-if="!ctx.selectedChapter.value && ctx.book.value" />
  <BookDetailsMobileReader v-else-if="ctx.selectedChapter.value" />
</template>

<style>
/* Mobile styles are dense — preserve the original mobile design tokens verbatim */

.mobile-bd-overview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  height: 100%;
  width: 100%;
  background: transparent;
  overflow: hidden;
}

.mbd-appbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  /* token: near night-500 @ 72% */
  background: var(--night-500-opacity-72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--white-opacity-6);
  flex-shrink: 0;
  position: relative;
  z-index: 5;
}

.mbd-appbar--reader {
  border-bottom: 1px solid var(--white-opacity-8);
  /* token: near night-500 @ 88% */
  background: rgba(10, 12, 15, 0.88);
}

.mbd-appbar-text {
  flex: 1;
  min-width: 0;
}

.mbd-appbar-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-weight: 600;
  font-size: 15px;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mbd-appbar-sub {
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mbd-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--moon-50-opacity-85);
  background: transparent;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbd-icon-btn:hover {
  background: var(--white-opacity-5);
}

.mbd-icon-btn i {
  font-size: 16px;
}

.mbd-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* Horizontal + bottom padding only — NO padding-top. Sticky elements inside
     (panel toolbars in terminology / character / memory tabs) use `top: 0` to
     stick under the appbar; padding-top would offset their stick point and
     leave a visible gap between the appbar and the stuck toolbar. */
  padding: 0 16px 24px;
  scrollbar-width: none;
}

.mbd-scroll::-webkit-scrollbar {
  width: 0;
}

.mbd-hero {
  display: flex;
  gap: 14px;
  /* margin-top replaces the old .mbd-scroll padding-top so hero still has
     breathing room under the appbar without breaking sticky children below. */
  margin-top: 16px;
  margin-bottom: 16px;
}

.mbd-hero-cover-wrap {
  width: 92px;
  height: 138px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  /* token: night-200 */
  background: var(--night-200);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.3);
}

.mbd-hero-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mbd-hero-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.mbd-hero-author {
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 4px;
}

.mbd-hero-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 19px;
  font-weight: 700;
  color: var(--moon-50-opacity-100);
  line-height: 1.3;
  letter-spacing: -0.01em;
  margin: 0 0 8px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.mbd-hero-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}

.mbd-badge {
  display: inline-block;
  padding: 3px 7px;
  background: var(--tsukuyomi-opacity-15);
  border: 1px solid var(--tsukuyomi-opacity-30);
  border-radius: 999px;
  font-size: 10px;
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
  white-space: nowrap;
}

.mbd-hero-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mbd-prog {
  flex: 1;
  height: 6px;
  background: var(--white-opacity-8);
  border-radius: 3px;
  overflow: hidden;
}

.mbd-prog-fill {
  height: 100%;
  /* token: tsukuyomi-500 → tsukuyomi-300 */
  background: linear-gradient(90deg, var(--tsukuyomi-500), var(--tsukuyomi-300));
  border-radius: 3px;
  transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbd-prog-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  /* token: moon-50 @ 72% */
  color: var(--moon-50-opacity-72);
  min-width: 32px;
  text-align: right;
}

.mbd-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.mbd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 10px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.mbd-btn i {
  font-size: 12px;
}

.mbd-btn-primary {
  flex: 1;
  /* token: tsukuyomi-500 → tsukuyomi-300 */
  background: linear-gradient(90deg, var(--tsukuyomi-500), var(--tsukuyomi-300));
  /* token: night-500 */
  color: var(--night-500);
  box-shadow: 0 2px 6px var(--tsukuyomi-opacity-30);
}

.mbd-btn-primary:hover {
  filter: brightness(1.05);
}

.mbd-btn-primary:disabled {
  opacity: 0.4;
  cursor: default;
  box-shadow: none;
}

.mbd-btn-outline {
  background: var(--white-opacity-4);
  color: var(--moon-50-opacity-85);
  border-color: var(--white-opacity-10);
}

.mbd-btn-outline:hover {
  background: var(--white-opacity-8);
}

.mbd-btn-icon {
  padding: 10px;
  aspect-ratio: 1;
}

.mbd-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 16px;
  padding: 12px 14px;
  /* token: white @ 3% */
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-8);
  border-radius: 10px;
}

.mbd-stat {
  text-align: center;
  border-right: 1px solid var(--white-opacity-6);
}

.mbd-stat:last-child {
  border-right: none;
}

.mbd-stat-value {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 15px;
  font-weight: 700;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.01em;
  line-height: 1;
}

.mbd-stat-label {
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.mbd-seg {
  display: flex;
  padding: 3px;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 9px;
  gap: 2px;
  margin-bottom: 14px;
}

.mbd-seg-btn {
  flex: 1;
  padding: 7px 6px;
  text-align: center;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--moon-50-opacity-70);
  border-radius: 7px;
  cursor: pointer;
  border: none;
  background: transparent;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbd-seg-btn-active {
  background: var(--tsukuyomi-opacity-20);
  /* token: primary (moon white) */
  color: var(--primary-200);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.mbd-tab-content {
  display: flex;
  flex-direction: column;
}

.mbd-chapter-actions {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  padding: 0 2px;
}

.mbd-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  border-radius: 6px;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbd-link-btn i {
  font-size: 11px;
}

.mbd-link-btn:hover {
  background: var(--white-opacity-5);
}

.mbd-panel {
  flex: 1;
  min-height: 0;
}

.mbd-tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-top: 6px;
  border: 1px solid var(--white-opacity-6);
  border-radius: 10px;
  overflow: hidden;
  /* token: white @ 2% */
  background: var(--white-opacity-2);
}

.mbd-tree-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  /* token: moon-50 @ 90% */
  color: var(--moon-50-opacity-90);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbd-tree-row:hover {
  /* token: white @ 3% */
  background: var(--white-opacity-3);
}

.mbd-tree-row--vol {
  /* token: white @ 4% */
  border-bottom: 1px solid var(--white-opacity-4);
  font-weight: 500;
}

.mbd-tree-row--vol-open {
  /* token: white @ 2% */
  background: var(--white-opacity-2);
}

.mbd-tree-row--chapter {
  padding-left: 28px;
  font-size: 12.5px;
  /* token: moon-50 @ 80% */
  color: var(--moon-50-opacity-80);
}

.mbd-tree-row--active {
  /* token: tsukuyomi-500 @ 12% */
  background: var(--tsukuyomi-opacity-12);
  /* token: primary-300 */
  color: var(--primary-300);
}

.mbd-tree-row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mbd-tree-row-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  flex-shrink: 0;
}

/* 行尾"更多"按钮：替代桌面右键菜单，点击弹出 bottom sheet 选编辑 / 删除 / 上下移 */
.mbd-tree-row-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: 2px;
  margin-right: -4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--moon-50-opacity-45);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbd-tree-row-more:active {
  background: var(--white-opacity-8);
  color: var(--moon-50-opacity-85);
}

.mbd-tree-row-more i {
  font-size: 12px;
}

.mbd-tree-vol-icon {
  /* token: accent-silver @ 85% */
  color: var(--accent-opacity-85);
  font-size: 14px;
  width: 14px;
  flex-shrink: 0;
}

.mbd-tree-chap-icon {
  font-size: 13px;
  width: 13px;
  flex-shrink: 0;
}

.mbd-tree-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  color: var(--moon-50-opacity-45);
  font-size: 12px;
}

.mbd-tree-empty i {
  font-size: 20px;
  opacity: 0.6;
}

/* ───────────────── Mobile Reader ───────────────── */
.mobile-reader {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 作为 .mbr-actionbar 的定位父级，让浮动操作栏贴在 reader 底部之上，
     而不是视口底部（后者会与 MobileTabBar 重叠导致遮挡） */
  position: relative;
}

.mbr-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  flex-shrink: 0;
  /* token: near night-500 @ 55% */
  background: var(--night-500-opacity-55);
  border-bottom: 1px solid var(--white-opacity-6);
}

.mbr-strip-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--tsukuyomi-opacity-15);
  border: 1px solid var(--tsukuyomi-opacity-30);
  border-radius: 999px;
  font-size: 10.5px;
  /* token: tsukuyomi-200 */
  color: var(--tsukuyomi-200);
  white-space: nowrap;
  flex-shrink: 0;
}

.mbr-strip-badge i {
  font-size: 9px;
}

.mbr-strip-stats {
  flex: 1;
  min-width: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mbr-strip-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: var(--tsukuyomi-opacity-25);
  border: 1px solid var(--tsukuyomi-opacity-40);
  /* token: primary-300 */
  color: var(--primary-300);
  border-radius: 8px;
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbr-strip-btn:hover:not(:disabled) {
  /* token: tsukuyomi-500 @ 38% */
  background: var(--tsukuyomi-opacity-38);
}

.mbr-strip-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.mbr-strip-btn i {
  font-size: 10.5px;
}

.mbr-strip-btn-caret {
  opacity: 0.75;
  font-size: 9px;
}

.mbr-strip-icon-btn {
  position: relative;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--white-opacity-4);
  border: 1px solid var(--white-opacity-8);
  border-radius: 8px;
  color: var(--moon-50-opacity-75);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbr-strip-icon-btn:hover {
  background: var(--white-opacity-8);
  color: var(--moon-50-opacity-100);
}

.mbr-strip-icon-btn i {
  font-size: 12px;
}

.mbr-strip-icon-btn--active {
  background: var(--tsukuyomi-opacity-20);
  /* token: tsukuyomi-500 @ 35% */
  border-color: var(--tsukuyomi-opacity-35);
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
}

.mbr-strip-icon-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  font-size: 9px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* token: tsukuyomi-500 */
  background: var(--tsukuyomi-500);
  /* token: white */
  color: white;
  border-radius: 999px;
}

/* 非滚动定位锚点：精确包住正文滚动区，作为自定义滚动条的 Teleport 目标 */
.mbr-scroll-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mbr-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* 右侧预留 22px 走廊给自定义滚动条，避免滑块压在正文上 */
  padding: 14px 22px 32px 14px;
  scrollbar-width: none;
  transition: padding-bottom 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* 隐藏 Chrome 键盘可聚焦滚动容器的蓝色焦点框（鼠标/触摸/程序化聚焦时），
   但保留键盘 :focus-visible 的轻量焦点指示以维持可访问性（与桌面 .chapter-content-panel 一致） */
.mbr-scroll:focus:not(:focus-visible) {
  outline: none;
}

.mbr-scroll:focus-visible {
  outline: 2px solid var(--tsukuyomi-opacity-40);
  outline-offset: -2px;
}

/* 选中段落时 actionbar 浮现，留出空间避免遮挡最后一段正文 */
.mbr-scroll--with-actionbar {
  padding-bottom: 100px;
}

.mbr-scroll::-webkit-scrollbar {
  width: 0;
}

/* 虚拟滚动：spacer 撑出全列表高度，window 用 block translation 单一平移 */
.vlist-spacer {
  position: relative;
  width: 100%;
}

.vlist-window {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.mbr-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 20px;
  color: var(--moon-50-opacity-55);
  font-size: 12px;
}

.mbr-p {
  padding: 10px 2px;
  border-bottom: 1px dashed var(--white-opacity-6);
  cursor: pointer;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbr-p:last-child {
  border-bottom: none;
}

.mbr-p.selected {
  /* token: tsukuyomi-500 @ 8% */
  background: var(--tsukuyomi-opacity-8);
  border-radius: 8px;
  padding-left: 8px;
  padding-right: 8px;
}

.mbr-p-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-45);
}

.mbr-p-num {
  /* token: moon-50 @ 65% */
  color: var(--moon-50-opacity-65);
  font-weight: 500;
  flex-shrink: 0;
}

.mbr-p-meta-ai {
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
  font-size: 9px;
}

.mbr-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 9.5px;
  border: 1px solid transparent;
  white-space: nowrap;
}

.mbr-badge i {
  font-size: 9px;
}

.mbr-badge-blue {
  background: var(--tsukuyomi-opacity-15);
  /* token: tsukuyomi-200 */
  color: var(--tsukuyomi-200);
  border-color: var(--tsukuyomi-opacity-30);
}

.mbr-p-ja {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 14px;
  line-height: 1.65;
  color: var(--moon-50-opacity-55);
  margin-bottom: 6px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.mbr-p-zh {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 15px;
  line-height: 1.8;
  /* token: moon-50 @ 96% */
  color: var(--moon-50-opacity-96);
  margin-bottom: 2px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.mbr-chapter-nav {
  display: flex;
  gap: 8px;
  margin-top: 20px;
  padding: 0 2px;
}

.mbr-nav-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  /* token: white @ 3% */
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  color: var(--moon-50-opacity-85);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbr-nav-btn:hover:not(:disabled) {
  background: var(--white-opacity-6);
}

.mbr-nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.mbr-actionbar {
  /* 相对于 .mobile-reader 的底部 —— reader 的 bottom 边界刚好位于 MobileTabBar
     上方（由 MainLayoutMobile 的 flex 布局保证），因此 absolute + bottom:12px
     自然留出 tab bar 上方的呼吸空间，不再依赖 env(safe-area-inset-bottom) 推算 */
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-radius: 16px;
  /* token: near night-100 @ 96% */
  background: var(--night-300-opacity-96);
  border: 1px solid var(--white-opacity-10);
  box-shadow:
    0 12px 36px rgba(0, 0, 0, 0.45),
    0 0 0 1px var(--tsukuyomi-opacity-12);
  z-index: 40;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.ab-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 8px 4px;
  background: transparent;
  border: none;
  /* token: moon-50 @ 82% */
  color: var(--moon-50-opacity-82);
  cursor: pointer;
  border-radius: 10px;
  font-family: inherit;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.1;
  white-space: nowrap;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-tap-highlight-color: transparent;
}

.ab-btn i {
  font-size: 18px;
  color: var(--moon-50-opacity-55);
  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ab-btn:hover:not(:disabled),
.ab-btn:active:not(:disabled) {
  background: var(--white-opacity-5);
}

.ab-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.ab-btn.primary i {
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
}

.ab-sep {
  width: 1px;
  height: 32px;
  background: var(--white-opacity-10);
  margin: 0 2px;
  flex-shrink: 0;
}

:global(.mbr-menu-danger) {
  /* token: danger */
  color: var(--color-danger) !important;
}

/* 章节目录 picker 内的树布局复用 .mbd-tree-row*；这里只收紧 sheet 内边距 */
.mbr-chapter-picker-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* ───── 批量操作 picker 选项（sheet 外壳由 MobileBottomSheet 提供） ───── */
.mbr-batch-picker-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-tap-highlight-color: transparent;
  margin-bottom: 2px;
  /* token: primary (moon white) */
  color: var(--primary-200);
}

.mbr-batch-picker-option:active {
  background: var(--white-opacity-4);
  border-color: var(--tsukuyomi-opacity-25);
}

.mbr-batch-picker-option:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mbr-batch-picker-option:disabled:active {
  background: transparent;
  border-color: transparent;
}

.mbr-batch-picker-option-icon {
  font-size: 15px;
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.mbr-batch-picker-option-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mbr-batch-picker-chev {
  /* token: moon-50 @ 35% */
  color: var(--moon-50-opacity-35);
  font-size: 11px;
  flex-shrink: 0;
}

.mbr-batch-picker-option--danger {
  /* token: danger */
  color: var(--color-danger);
}

.mbr-batch-picker-option--danger .mbr-batch-picker-option-icon {
  /* token: danger */
  color: var(--color-danger);
}

.mbr-batch-picker-option--danger:active {
  /* token: danger @ 8% */
  background: var(--color-danger-opacity-8);
  /* token: danger @ 30% */
  border-color: var(--color-danger-opacity-30);
}

.mbr-batch-picker-sep {
  height: 1px;
  background: var(--white-opacity-6);
  margin: 6px 8px;
}

.mbr-batch-picker-empty {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 12px;
  margin: 8px 0 4px;
  /* token: tsukuyomi-500 @ 6% */
  background: var(--tsukuyomi-opacity-6);
  border: 1px solid var(--tsukuyomi-opacity-18);
  border-radius: 10px;
  font-size: 12px;
  color: var(--moon-50-opacity-75);
  line-height: 1.5;
}

.mbr-batch-picker-empty i {
  font-size: 14px;
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
  margin-top: 1px;
  flex-shrink: 0;
}
</style>
