<script setup lang="ts">
/**
 * 桌面端右下角的月詠桌宠（只由 MainLayoutDesktop 挂载）：现有月詠头像 + 对话气泡，
 * 在任务中心与助手面板收起时转述翻译类任务和助手的进度。状态与规则见 useDeskPet，
 * 头像、小结与任务进度分别在 DeskPetAvatar / DeskPetSummary / DeskPetTaskBubble。
 */
import { useDeskPet } from 'src/composables/desk-pet/useDeskPet';
import DeskPetAvatar from './DeskPetAvatar.vue';
import DeskPetSummary from './DeskPetSummary.vue';
import DeskPetTaskBubble from './DeskPetTaskBubble.vue';

const pet = useDeskPet();
</script>

<template>
  <div v-if="pet.visible.value" class="dp" :class="`dp--${pet.mood.value}`" data-testid="desk-pet">
    <!-- 流式进度更新很频繁，只让结果小结播报给读屏；气泡从头像方向冒出、收回 -->
    <Transition name="dp-bubble">
      <div v-if="pet.bubble.value !== 'none'" class="dp-bubble">
        <div v-if="pet.summary.value" role="status" aria-live="polite">
          <DeskPetSummary
            :summary="pet.summary.value"
            @open="pet.openSummary"
            @dismiss="pet.dismissSummary"
          />
        </div>
        <DeskPetTaskBubble
          v-else-if="pet.followed.value"
          :followed="pet.followed.value"
          :entries="pet.entries.value"
          :expanded="pet.expanded.value"
          :candidate-count="pet.candidateCount.value"
          :follow-index="pet.followIndex.value"
          @toggle="pet.toggleExpanded"
          @open-task-center="pet.openTaskCenter"
          @previous="pet.selectPrevious"
          @next="pet.selectNext"
        />
      </div>
    </Transition>

    <DeskPetAvatar
      :mood="pet.mood.value"
      :running-count="pet.runningCount.value"
      :summary-tone="pet.summary.value?.tone ?? 'neutral'"
      :failed="pet.summary.value?.failed ?? 0"
      @activate="pet.openAssistant"
    />
  </div>
</template>

<style scoped>
.dp {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
}

.dp > * {
  pointer-events: auto;
}

.dp-bubble {
  width: 300px;
  max-width: calc(100vw - 32px);
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(20, 23, 29, 0.96);
  border: 1px solid var(--white-opacity-10);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: var(--moon-opacity-90);
  font-size: 12px;
  line-height: 1.55;
}

/* 小结与任务进度共用的文字按钮 */
.dp-bubble :deep(.dp-link) {
  padding: 2px 6px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 11px;
  color: var(--btn-text-color);
  cursor: pointer;
}

.dp-bubble :deep(.dp-link:hover) {
  background: var(--btn-text-hover-bg);
  color: var(--btn-text-hover-color);
}

.dp-bubble-enter-active,
.dp-bubble-leave-active {
  transform-origin: 100% 100%;
  transition:
    opacity 180ms ease,
    transform 260ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.dp-bubble-enter-from,
.dp-bubble-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.92);
}

@media (prefers-reduced-motion: reduce) {
  .dp-bubble-enter-active,
  .dp-bubble-leave-active {
    transition: opacity 120ms ease;
  }

  .dp-bubble-enter-from,
  .dp-bubble-leave-to {
    transform: none;
  }
}
</style>
