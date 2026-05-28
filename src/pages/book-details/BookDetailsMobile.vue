<script setup lang="ts">
import { computed, ref } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';
import TerminologyPanel from 'src/components/novel/TerminologyPanel.vue';
import CharacterSettingPanel from 'src/components/novel/CharacterSettingPanel.vue';
import MemoryPanel from 'src/components/novel/MemoryPanel.vue';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import type { Chapter, Volume } from 'src/models/novel';

const ctx = injectBookDetailsPage();

// 阅读器内的"章节目录"按钮在手机端改为底部抽屉 picker：
// 旧行为会调用 onNavigateToChapterList() 强制 setSelectedChapter(null) ，
// 把用户从阅读器踢回 overview；新行为保留当前阅读上下文，仅弹出 sheet。
const showChapterListPicker = ref(false);
const openChapterListPicker = () => {
  showChapterListPicker.value = true;
};
const pickChapterFromSheet = (ch: Chapter) => {
  showChapterListPicker.value = false;
  ctx.onNavigateToChapter(ch);
};

// 卷 / 章节行的"更多操作" picker —— 手机端替代桌面右键菜单 / 悬浮按钮。
// 通过单个 bottom sheet 承载编辑 / 删除 / 上移 / 下移动作，避免每行塞一堆图标。
const volumeActionTarget = ref<Volume | null>(null);
const openVolumeActions = (vol: Volume) => {
  volumeActionTarget.value = vol;
};
const closeVolumeActions = () => {
  volumeActionTarget.value = null;
};
const showVolumeActions = computed({
  get: () => volumeActionTarget.value !== null,
  set: (open) => {
    if (!open) closeVolumeActions();
  },
});
const runVolumeEdit = () => {
  const vol = volumeActionTarget.value;
  closeVolumeActions();
  if (vol) ctx.onEditVolume(vol);
};
const runVolumeDelete = () => {
  const vol = volumeActionTarget.value;
  closeVolumeActions();
  if (vol) ctx.onDeleteVolume(vol);
};

const chapterActionTarget = ref<{ chapter: Chapter; volumeId: string; index: number } | null>(null);
const openChapterActions = (chapter: Chapter, volumeId: string, index: number) => {
  chapterActionTarget.value = { chapter, volumeId, index };
};
const closeChapterActions = () => {
  chapterActionTarget.value = null;
};
const showChapterActions = computed({
  get: () => chapterActionTarget.value !== null,
  set: (open) => {
    if (!open) closeChapterActions();
  },
});
const chapterActionVolume = computed(() =>
  chapterActionTarget.value
    ? (ctx.volumes.value.find((v) => v.id === chapterActionTarget.value!.volumeId) ?? null)
    : null,
);
const chapterActionCanMoveUp = computed(() =>
  chapterActionTarget.value ? chapterActionTarget.value.index > 0 : false,
);
const chapterActionCanMoveDown = computed(() => {
  const target = chapterActionTarget.value;
  const vol = chapterActionVolume.value;
  if (!target || !vol?.chapters) return false;
  return target.index < vol.chapters.length - 1;
});
const runChapterEdit = () => {
  const target = chapterActionTarget.value;
  closeChapterActions();
  if (target) ctx.onEditChapter(target.chapter);
};
const runChapterDelete = () => {
  const target = chapterActionTarget.value;
  closeChapterActions();
  if (target) ctx.onDeleteChapter(target.chapter);
};
const runChapterMove = (direction: 'up' | 'down') => {
  const target = chapterActionTarget.value;
  closeChapterActions();
  if (!target) return;
  void ctx.onMoveChapter({ ...target, direction });
};
</script>

<template>
  <!-- ─────────────── 手机端 · 书籍详情 Overview ─────────────── -->
  <div v-if="!ctx.selectedChapter.value && ctx.book.value" class="mobile-bd-overview">
    <header class="mbd-appbar">
      <button
        class="mbd-icon-btn"
        aria-label="返回书籍列表"
        @click="() => void ctx.router.push('/books')"
      >
        <i class="pi pi-chevron-left" aria-hidden="true" />
      </button>
      <div class="mbd-appbar-text">
        <div class="mbd-appbar-title">{{ ctx.book.value.title }}</div>
        <div v-if="ctx.book.value.author" class="mbd-appbar-sub">{{ ctx.book.value.author }}</div>
      </div>
      <button class="mbd-icon-btn" aria-label="更多操作" @click="ctx.openBookDialog">
        <i class="pi pi-ellipsis-h" aria-hidden="true" />
      </button>
    </header>

    <div class="mbd-scroll">
      <!-- Hero row -->
      <section class="mbd-hero">
        <div class="mbd-hero-cover-wrap">
          <img
            :src="ctx.getCoverUrl(ctx.book.value)"
            :alt="ctx.book.value.title"
            class="mbd-hero-cover"
            @error="
              (e) => {
                const t = e.target as HTMLImageElement;
                if (ctx.book.value) t.src = ctx.getCoverUrl(ctx.book.value);
              }
            "
          />
        </div>
        <div class="mbd-hero-body">
          <div v-if="ctx.book.value.author" class="mbd-hero-author">{{ ctx.book.value.author }}</div>
          <h1 class="mbd-hero-title">{{ ctx.book.value.title }}</h1>
          <div v-if="ctx.book.value.tags?.length" class="mbd-hero-badges">
            <span v-for="tag in ctx.book.value.tags.slice(0, 3)" :key="tag" class="mbd-badge">
              {{ tag }}
            </span>
          </div>
          <div class="mbd-hero-progress">
            <div class="mbd-prog">
              <div class="mbd-prog-fill" :style="{ width: `${ctx.mobileBookProgress.value}%` }" />
            </div>
            <span class="mbd-prog-value">{{ ctx.mobileBookProgress.value }}%</span>
          </div>
        </div>
      </section>

      <!-- Action row -->
      <div class="mbd-actions">
        <button
          class="mbd-btn mbd-btn-primary"
          :disabled="!ctx.continueReadingChapter.value"
          @click="ctx.continueReadingOnPhone"
        >
          <i class="pi pi-play" aria-hidden="true" />继续翻译
        </button>
        <button
          class="mbd-btn mbd-btn-outline mbd-btn-icon"
          aria-label="编辑书籍"
          @click="ctx.openBookDialog"
        >
          <i class="pi pi-pencil" aria-hidden="true" />
        </button>
        <button
          class="mbd-btn mbd-btn-outline mbd-btn-icon"
          aria-label="检查更新"
          @click="ctx.openScraperDialog"
        >
          <i class="pi pi-download" aria-hidden="true" />
        </button>
      </div>

      <!-- Stats strip -->
      <div v-if="ctx.stats.value" class="mbd-stats">
        <div class="mbd-stat">
          <div class="mbd-stat-value">{{ ctx.stats.value.volumeCount }}</div>
          <div class="mbd-stat-label">卷数</div>
        </div>
        <div class="mbd-stat">
          <div class="mbd-stat-value">{{ ctx.stats.value.chapterCount }}</div>
          <div class="mbd-stat-label">章节</div>
        </div>
        <div class="mbd-stat">
          <div class="mbd-stat-value">{{ ctx.formatWordCount(ctx.stats.value.wordCount) }}</div>
          <div class="mbd-stat-label">字数</div>
        </div>
        <div class="mbd-stat">
          <div class="mbd-stat-value">{{ ctx.formatRelativeDate(ctx.book.value.lastEdited) }}</div>
          <div class="mbd-stat-label">更新</div>
        </div>
      </div>

      <!-- Segmented tabs -->
      <div class="mbd-seg">
        <button
          class="mbd-seg-btn"
          :class="{ 'mbd-seg-btn-active': ctx.mobileActiveTab.value === 'chapters' }"
          @click="ctx.switchMobileTab('chapters')"
        >
          章节
        </button>
        <button
          class="mbd-seg-btn"
          :class="{ 'mbd-seg-btn-active': ctx.mobileActiveTab.value === 'terms' }"
          @click="ctx.switchMobileTab('terms')"
        >
          {{
            ctx.stableTerminologies.value.length
              ? `术语 ${ctx.stableTerminologies.value.length}`
              : '术语'
          }}
        </button>
        <button
          class="mbd-seg-btn"
          :class="{ 'mbd-seg-btn-active': ctx.mobileActiveTab.value === 'characters' }"
          @click="ctx.switchMobileTab('characters')"
        >
          {{
            ctx.stableCharacterSettings.value.length
              ? `角色 ${ctx.stableCharacterSettings.value.length}`
              : '角色'
          }}
        </button>
        <button
          class="mbd-seg-btn"
          :class="{ 'mbd-seg-btn-active': ctx.mobileActiveTab.value === 'memory' }"
          @click="ctx.switchMobileTab('memory')"
        >
          记忆
        </button>
      </div>

      <!-- Tab content -->
      <div class="mbd-tab-content">
        <template v-if="ctx.mobileActiveTab.value === 'chapters'">
          <div class="mbd-chapter-actions">
            <button class="mbd-link-btn" @click="ctx.showAddVolumeDialog.value = true">
              <i class="pi pi-plus" aria-hidden="true" />新卷
            </button>
            <button class="mbd-link-btn" @click="ctx.openAddChapterDialog">
              <i class="pi pi-plus-circle" aria-hidden="true" />新章节
            </button>
          </div>

          <!-- 清爽的手机端章节树：卷（可折叠）+ 章节（状态图标 + 百分比） -->
          <div class="mbd-tree">
            <template v-for="vol in ctx.volumes.value" :key="vol.id">
              <div
                class="mbd-tree-row mbd-tree-row--vol"
                :class="{ 'mbd-tree-row--vol-open': ctx.isVolumeExpanded(vol.id) }"
                role="button"
                @click="ctx.toggleVolumeById(vol.id)"
              >
                <i
                  class="pi mbd-tree-vol-icon"
                  :class="ctx.isVolumeExpanded(vol.id) ? 'pi-folder-open' : 'pi-folder'"
                  aria-hidden="true"
                />
                <span class="mbd-tree-row-title">{{ ctx.getVolumeDisplayTitle(vol) }}</span>
                <span class="mbd-tree-row-count">{{ vol.chapters?.length ?? 0 }} 章</span>
                <button
                  type="button"
                  class="mbd-tree-row-more"
                  aria-label="卷操作"
                  @click.stop="openVolumeActions(vol)"
                >
                  <i class="pi pi-ellipsis-v" aria-hidden="true" />
                </button>
              </div>
              <template v-if="ctx.isVolumeExpanded(vol.id)">
                <div
                  v-for="(ch, chIdx) in vol.chapters || []"
                  :key="ch.id"
                  class="mbd-tree-row mbd-tree-row--chapter"
                  :class="{
                    'mbd-tree-row--active':
                      ctx.continueReadingChapter.value &&
                      ctx.continueReadingChapter.value.id === ch.id,
                  }"
                  role="button"
                  @click="ctx.onNavigateToChapter(ch)"
                >
                  <i
                    class="pi mbd-tree-chap-icon"
                    :class="ctx.chapterStatusIcon(ch.id)"
                    :style="{ color: ctx.chapterStatusColor(ch.id) }"
                    aria-hidden="true"
                  />
                  <span class="mbd-tree-row-title">
                    {{ ctx.getChapterDisplayTitle(ch, ctx.book.value || undefined) }}
                  </span>
                  <span
                    class="mbd-tree-row-count"
                    :style="{ color: ctx.chapterStatusTextColor(ch.id) }"
                  >
                    {{ ctx.chapterStatusLabel(ch.id) }}
                  </span>
                  <button
                    type="button"
                    class="mbd-tree-row-more"
                    aria-label="章节操作"
                    @click.stop="openChapterActions(ch, vol.id, chIdx)"
                  >
                    <i class="pi pi-ellipsis-v" aria-hidden="true" />
                  </button>
                </div>
              </template>
            </template>

            <div v-if="ctx.volumes.value.length === 0" class="mbd-tree-empty">
              <i class="pi pi-folder-open" aria-hidden="true" />
              <span>尚未创建卷或章节</span>
            </div>
          </div>
        </template>
        <TerminologyPanel
          v-else-if="ctx.mobileActiveTab.value === 'terms'"
          :book="ctx.book.value || null"
          class="mbd-panel"
        />
        <CharacterSettingPanel
          v-else-if="ctx.mobileActiveTab.value === 'characters'"
          :book="ctx.book.value || null"
          class="mbd-panel"
        />
        <MemoryPanel
          v-else-if="ctx.mobileActiveTab.value === 'memory'"
          :book="ctx.book.value || null"
          class="mbd-panel"
        />
      </div>
    </div>
  </div>

  <!-- 手机端 · 阅读页顶部 app bar -->
  <header v-if="ctx.selectedChapter.value" class="mbd-appbar mbd-appbar--reader">
    <button
      class="mbd-icon-btn"
      aria-label="返回书籍详情"
      @click="ctx.onNavigateToChapterList"
    >
      <i class="pi pi-chevron-left" aria-hidden="true" />
    </button>
    <div class="mbd-appbar-text">
      <div class="mbd-appbar-title">
        {{
          ctx.getChapterDisplayTitle(ctx.selectedChapter.value, ctx.book.value || undefined) ||
          '未命名章节'
        }}
      </div>
      <div class="mbd-appbar-sub">
        {{ ctx.book.value?.title }}<template v-if="ctx.mobileReaderStats.value.total > 0">
          ·
          {{
            Math.round(
              (ctx.mobileReaderStats.value.translated / ctx.mobileReaderStats.value.total) * 100,
            )
          }}%
        </template>
      </div>
    </div>
    <button class="mbd-icon-btn" aria-label="章节目录" @click="openChapterListPicker">
      <i class="pi pi-list" aria-hidden="true" />
    </button>
    <button class="mbd-icon-btn" aria-label="章节设置" @click="ctx.toggleChapterSettingsPopover">
      <i class="pi pi-cog" aria-hidden="true" />
    </button>
  </header>

  <!-- 手机端阅读器主体 -->
  <div v-if="ctx.selectedChapter.value" class="mobile-reader">
    <!-- 翻译状态条 -->
    <div class="mbr-strip">
      <span class="mbr-strip-badge">
        <i class="pi pi-sparkles" aria-hidden="true" />
        {{ ctx.mobileReaderModelName.value }}
      </span>
      <span class="mbr-strip-stats">
        共 {{ ctx.mobileReaderStats.value.total }} 段 · 已译
        {{ ctx.mobileReaderStats.value.translated }}
      </span>
      <button
        class="mbr-strip-icon-btn"
        :class="{ 'mbr-strip-icon-btn--active': ctx.mobileBatchBusy.value }"
        aria-label="翻译进度"
        @click="ctx.openMobileTranslationProgress"
      >
        <i
          class="pi"
          :class="ctx.mobileBatchBusy.value ? 'pi-spin pi-spinner' : 'pi-objects-column'"
          aria-hidden="true"
        />
        <span
          v-if="ctx.activeTranslationTaskCount.value > 0"
          class="mbr-strip-icon-badge"
        >
          {{ ctx.activeTranslationTaskCount.value }}
        </span>
      </button>
      <button
        class="mbr-strip-btn"
        :disabled="ctx.mobileBatchBusy.value || ctx.mobileBatchMenuItems.value.length === 0"
        aria-haspopup="dialog"
        :aria-expanded="ctx.showMobileBatchPicker.value"
        @click="ctx.openMobileBatchPicker"
      >
        <i
          class="pi"
          :class="ctx.mobileBatchBusy.value ? 'pi-spin pi-spinner' : 'pi-play'"
          aria-hidden="true"
        />
        批量
        <i class="pi pi-chevron-down mbr-strip-btn-caret" aria-hidden="true" />
      </button>
    </div>

    <!-- 段落列表 -->
    <div
      :ref="ctx.setChapterContentPanelRef"
      class="mbr-scroll"
      :class="{ 'mbr-scroll--with-actionbar': !!ctx.mobileSelectedParagraphId.value }"
    >
      <div v-if="ctx.isLoadingChapterContent.value" class="mbr-state">
        <ProgressSpinner
          style="width: 28px; height: 28px"
          stroke-width="4"
          animation-duration=".8s"
          aria-label="加载中"
        />
        <span>加载章节内容…</span>
      </div>
      <template v-else>
        <div
          v-for="(p, idx) in ctx.selectedChapterParagraphs.value"
          :key="p.id"
          class="mbr-p"
          :class="{ selected: ctx.mobileSelectedParagraphId.value === p.id }"
          @click="
            ctx.mobileSelectedParagraphId.value =
              ctx.mobileSelectedParagraphId.value === p.id ? null : p.id
          "
        >
          <!-- Meta row -->
          <div class="mbr-p-meta">
            <span class="mbr-p-num">§ {{ String(idx + 1).padStart(3, '0') }}</span>
            <template v-if="ctx.translatingParagraphIds.value.has(p.id)">
              <span class="mbr-badge mbr-badge-blue">
                <i class="pi pi-spin pi-spinner" aria-hidden="true" />翻译中…
              </span>
            </template>
            <template v-else-if="ctx.polishingParagraphIds.value.has(p.id)">
              <span class="mbr-badge mbr-badge-blue">
                <i class="pi pi-spin pi-spinner" aria-hidden="true" />润色中…
              </span>
            </template>
            <template v-else-if="ctx.proofreadingParagraphIds.value.has(p.id)">
              <span class="mbr-badge mbr-badge-blue">
                <i class="pi pi-spin pi-spinner" aria-hidden="true" />校对中…
              </span>
            </template>
            <template v-else-if="(p.translations?.length ?? 0) > 0">
              <i class="pi pi-sparkles mbr-p-meta-ai" aria-hidden="true" />
              <span v-if="ctx.getParagraphModelName(p)">{{ ctx.getParagraphModelName(p) }}</span>
            </template>
            <!-- 空段 / 待翻译 状态不再展示徽章，仅以 §编号 标注段落位置 -->
          </div>

          <!-- Original -->
          <div v-if="(p.text ?? '').trim().length > 0" class="mbr-p-ja">{{ p.text }}</div>

          <!-- Translation -->
          <div v-if="ctx.getParagraphTranslationText(p)" class="mbr-p-zh">
            {{ ctx.getParagraphTranslationText(p) }}
          </div>
        </div>

        <!-- Prev / Next chapter -->
        <div class="mbr-chapter-nav">
          <button
            class="mbr-nav-btn"
            :disabled="!ctx.prevChapter.value"
            @click="ctx.prevChapter.value && ctx.onNavigateToChapter(ctx.prevChapter.value)"
          >
            <i class="pi pi-chevron-left" aria-hidden="true" />上一章
          </button>
          <button
            class="mbr-nav-btn"
            :disabled="!ctx.nextChapter.value"
            @click="ctx.nextChapter.value && ctx.onNavigateToChapter(ctx.nextChapter.value)"
          >
            下一章<i class="pi pi-chevron-right" aria-hidden="true" />
          </button>
        </div>
      </template>
    </div>

    <!-- Floating action bar for selected paragraph -->
    <div v-if="ctx.mobileSelectedParagraphId.value" class="mbr-actionbar">
      <button
        class="ab-btn primary"
        :disabled="ctx.translatingParagraphIds.value.has(ctx.mobileSelectedParagraphId.value)"
        @click="ctx.retranslateParagraph(ctx.mobileSelectedParagraphId.value)"
      >
        <i class="pi pi-sparkles" aria-hidden="true" />
        <span>翻译</span>
      </button>
      <button
        class="ab-btn"
        :disabled="ctx.polishingParagraphIds.value.has(ctx.mobileSelectedParagraphId.value)"
        @click="ctx.polishParagraph(ctx.mobileSelectedParagraphId.value)"
      >
        <i class="pi pi-pencil" aria-hidden="true" />
        <span>润色</span>
      </button>
      <button
        class="ab-btn"
        :disabled="ctx.proofreadingParagraphIds.value.has(ctx.mobileSelectedParagraphId.value)"
        @click="ctx.proofreadParagraph(ctx.mobileSelectedParagraphId.value)"
      >
        <i class="pi pi-check-circle" aria-hidden="true" />
        <span>校对</span>
      </button>
      <div class="ab-sep" />
      <button class="ab-btn" @click="ctx.mobileSelectedParagraphId.value = null">
        <i class="pi pi-times" aria-hidden="true" />
        <span>关闭</span>
      </button>
    </div>

    <!-- 批量操作 picker —— 使用共享 MobileBottomSheet 外壳 -->
    <MobileBottomSheet
      v-model:visible="ctx.showMobileBatchPicker.value"
      title="批量操作"
      eyebrow="CHAPTER · 批量"
    >
      <template
        v-for="(item, idx) in ctx.mobileBatchMenuItems.value"
        :key="item.separator ? `sep-${idx}` : (item.label ?? `item-${idx}`)"
      >
        <div v-if="item.separator" class="mbr-batch-picker-sep" />
        <button
          v-else
          type="button"
          class="mbr-batch-picker-option"
          :class="{ 'mbr-batch-picker-option--danger': item.class === 'mbr-menu-danger' }"
          @click="ctx.runMobileBatchItem(item)"
        >
          <i
            v-if="item.icon"
            :class="['pi', item.icon, 'mbr-batch-picker-option-icon']"
            aria-hidden="true"
          />
          <span class="mbr-batch-picker-option-label">{{ item.label }}</span>
          <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
        </button>
      </template>
      <div v-if="ctx.mobileBatchMenuItems.value.length === 0" class="mbr-batch-picker-empty">
        <i class="pi pi-info-circle" aria-hidden="true" />
        <span>当前章节没有可执行的批量操作。</span>
      </div>
    </MobileBottomSheet>

    <!-- 章节目录 picker —— 阅读中弹出，不打断当前章节 -->
    <MobileBottomSheet
      v-model:visible="showChapterListPicker"
      title="章节目录"
      eyebrow="BOOK · 目录"
      max-height="86dvh"
    >
      <div class="mbr-chapter-picker-tree">
        <template v-for="vol in ctx.volumes.value" :key="vol.id">
          <button
            class="mbd-tree-row mbd-tree-row--vol"
            :class="{ 'mbd-tree-row--vol-open': ctx.isVolumeExpanded(vol.id) }"
            @click="ctx.toggleVolumeById(vol.id)"
          >
            <i
              class="pi mbd-tree-vol-icon"
              :class="ctx.isVolumeExpanded(vol.id) ? 'pi-folder-open' : 'pi-folder'"
              aria-hidden="true"
            />
            <span class="mbd-tree-row-title">{{ ctx.getVolumeDisplayTitle(vol) }}</span>
            <span class="mbd-tree-row-count">{{ vol.chapters?.length ?? 0 }} 章</span>
          </button>
          <template v-if="ctx.isVolumeExpanded(vol.id)">
            <div
              v-for="ch in vol.chapters || []"
              :key="ch.id"
              class="mbd-tree-row mbd-tree-row--chapter"
              :class="{
                'mbd-tree-row--active':
                  ctx.selectedChapter.value && ctx.selectedChapter.value.id === ch.id,
              }"
              role="button"
              @click="pickChapterFromSheet(ch)"
            >
              <i
                class="pi mbd-tree-chap-icon"
                :class="ctx.chapterStatusIcon(ch.id)"
                :style="{ color: ctx.chapterStatusColor(ch.id) }"
                aria-hidden="true"
              />
              <span class="mbd-tree-row-title">
                {{ ctx.getChapterDisplayTitle(ch, ctx.book.value || undefined) }}
              </span>
              <span
                class="mbd-tree-row-count"
                :style="{ color: ctx.chapterStatusTextColor(ch.id) }"
              >
                {{ ctx.chapterStatusLabel(ch.id) }}
              </span>
            </div>
          </template>
        </template>

        <div v-if="ctx.volumes.value.length === 0" class="mbd-tree-empty">
          <i class="pi pi-folder-open" aria-hidden="true" />
          <span>尚未创建卷或章节</span>
        </div>
      </div>
    </MobileBottomSheet>
  </div>

  <!-- ─────────────── 卷 / 章节操作 picker（overview 和阅读器都可触发） ─────────────── -->
  <!-- 卷操作 picker —— 编辑 / 删除 -->
  <MobileBottomSheet
    v-model:visible="showVolumeActions"
    :title="volumeActionTarget ? ctx.getVolumeDisplayTitle(volumeActionTarget) : '卷操作'"
    eyebrow="VOLUME"
    min-height="auto"
  >
    <button type="button" class="mbr-batch-picker-option" @click="runVolumeEdit">
      <i class="pi pi-pencil mbr-batch-picker-option-icon" aria-hidden="true" />
      <span class="mbr-batch-picker-option-label">编辑卷</span>
      <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mbr-batch-picker-option mbr-batch-picker-option--danger"
      @click="runVolumeDelete"
    >
      <i class="pi pi-trash mbr-batch-picker-option-icon" aria-hidden="true" />
      <span class="mbr-batch-picker-option-label">删除卷</span>
      <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
    </button>
  </MobileBottomSheet>

  <!-- 章节操作 picker —— 编辑 / 删除 / 上下移 -->
  <MobileBottomSheet
    v-model:visible="showChapterActions"
    :title="
      chapterActionTarget
        ? ctx.getChapterDisplayTitle(chapterActionTarget.chapter, ctx.book.value || undefined)
        : '章节操作'
    "
    eyebrow="CHAPTER"
    min-height="auto"
  >
    <button type="button" class="mbr-batch-picker-option" @click="runChapterEdit">
      <i class="pi pi-pencil mbr-batch-picker-option-icon" aria-hidden="true" />
      <span class="mbr-batch-picker-option-label">编辑章节</span>
      <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mbr-batch-picker-option"
      :disabled="!chapterActionCanMoveUp"
      @click="runChapterMove('up')"
    >
      <i class="pi pi-arrow-up mbr-batch-picker-option-icon" aria-hidden="true" />
      <span class="mbr-batch-picker-option-label">上移</span>
      <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mbr-batch-picker-option"
      :disabled="!chapterActionCanMoveDown"
      @click="runChapterMove('down')"
    >
      <i class="pi pi-arrow-down mbr-batch-picker-option-icon" aria-hidden="true" />
      <span class="mbr-batch-picker-option-label">下移</span>
      <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
    </button>
    <div class="mbr-batch-picker-sep" />
    <button
      type="button"
      class="mbr-batch-picker-option mbr-batch-picker-option--danger"
      @click="runChapterDelete"
    >
      <i class="pi pi-trash mbr-batch-picker-option-icon" aria-hidden="true" />
      <span class="mbr-batch-picker-option-label">删除章节</span>
      <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
    </button>
  </MobileBottomSheet>
</template>

<style scoped>
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

.mbr-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 14px 32px;
  scrollbar-width: none;
  transition: padding-bottom 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* 选中段落时 actionbar 浮现，留出空间避免遮挡最后一段正文 */
.mbr-scroll--with-actionbar {
  padding-bottom: 100px;
}

.mbr-scroll::-webkit-scrollbar {
  width: 0;
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
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
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
