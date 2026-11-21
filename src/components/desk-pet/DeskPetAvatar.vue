<script setup lang="ts">
/**
 * 月詠桌宠的头像：现有月詠头像 + 状态外圈、转动弧线、角标与空闲「zzz」。
 * 运行中角标为任务数；待查看时成功为勾、有失败为失败数。
 *
 * 动效分层：外圈（运行中呼吸发光、完成后开心蹦跳 + 涟漪、失败摇头 + 红色涟漪、空闲打瞌睡点头），
 * 头像（运行中埋头左右轻摇；换状态时重新挂载弹入），角标数字变化时弹一下。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import type { DeskPetMood } from 'src/composables/desk-pet/desk-pet-state';

const props = defineProps<{
  mood: DeskPetMood;
  runningCount: number;
  /** 待查看小结的结果：成功为勾、有失败为失败数、只有被停止的任务时不显示角标 */
  summaryTone: 'ok' | 'fail' | 'neutral';
  failed: number;
}>();
const emit = defineEmits<{ activate: [] }>();

const { t } = useI18n();

const badge = computed(() => {
  if (props.mood === 'running') return { text: String(props.runningCount), tone: 'run' };
  if (props.mood !== 'review' || props.summaryTone === 'neutral') return null;
  if (props.summaryTone === 'fail') return { text: String(props.failed || '!'), tone: 'fail' };
  return { text: '', tone: 'ok' };
});
const label = computed(() => t('deskPetUi.openAssistant'));
</script>

<template>
  <button
    type="button"
    class="dpa"
    :class="[`dpa--${mood}`, { 'dpa--fail': mood === 'review' && summaryTone === 'fail' }]"
    :aria-label="label"
    :title="label"
    data-testid="desk-pet-avatar"
    @click="emit('activate')"
  >
    <span class="dpa-ring">
      <span v-if="mood === 'running'" class="dpa-arc" aria-hidden="true" />
      <!-- 换状态时重新挂载，播放弹入动画 -->
      <span :key="mood" class="dpa-face">
        <AssistantAvatar :size="mood === 'idle' ? 40 : 56" />
      </span>
    </span>
    <!-- 数字或结果变化时重新挂载，角标弹一下 -->
    <span
      v-if="badge"
      :key="`${badge.tone}-${badge.text}`"
      class="dpa-badge"
      :class="`dpa-badge--${badge.tone}`"
      aria-hidden="true"
    >
      <i v-if="badge.tone === 'ok'" class="pi pi-check" />
      <template v-else>{{ badge.text }}</template>
    </span>
    <!-- 三个 z 错开节奏依次飘起、放大、淡出 -->
    <span v-if="mood === 'idle'" class="dpa-zzz" aria-hidden="true"
      ><span v-for="n in 3" :key="n" class="dpa-z">z</span></span
    >
  </button>
</template>

<style scoped>
.dpa {
  position: relative;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  transition: transform 180ms ease;
}

/* 鼠标移上来时整体微微抬起，提示可以点击 */
.dpa:hover,
.dpa:focus-visible {
  transform: translateY(-2px);
}

.dpa-ring {
  position: relative;
  display: block;
  padding: 3px;
  border-radius: 50%;
  border: 2px solid var(--white-opacity-14);
  background: rgba(20, 23, 29, 0.9);
  transition:
    border-color 200ms ease,
    opacity 200ms ease;
}

.dpa-face {
  display: block;
  border-radius: 50%;
  animation: dpa-enter 420ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 运行中：外圈呼吸并发出薄蓝光晕，弧线快慢交替地转，头像像埋头干活一样左右轻摇 */
.dpa--running .dpa-ring {
  border-color: rgba(163, 183, 207, 0.75);
  animation:
    dpa-breathe 2.4s ease-in-out infinite,
    dpa-glow 2.4s ease-in-out infinite;
}

.dpa--running .dpa-face {
  transform-origin: 50% 85%;
  animation:
    dpa-enter 420ms cubic-bezier(0.34, 1.56, 0.64, 1),
    dpa-work 1.8s ease-in-out 420ms infinite;
}

/* 待查看：完成后开心地蹦一下并荡出绿色涟漪；有失败时摇摇头、荡出红色涟漪 */
.dpa--review .dpa-ring {
  --dpa-ripple: 127, 194, 155;
  border-color: rgba(127, 194, 155, 0.75);
  transform-origin: 50% 100%;
  animation:
    dpa-hop 3.2s ease-in-out infinite,
    dpa-ripple 2.4s ease-out infinite;
}

.dpa--review.dpa--fail .dpa-ring {
  --dpa-ripple: 240, 163, 163;
  border-color: rgba(240, 163, 163, 0.75);
  transform-origin: 50% 50%;
  animation:
    dpa-shake 3.6s ease-in-out infinite,
    dpa-ripple 2.4s ease-out infinite;
}

/* 空闲：变暗并慢慢打瞌睡点头；鼠标移上来时醒来（变亮、停住、zzz 淡去） */
.dpa--idle .dpa-ring {
  opacity: 0.6;
  transform-origin: 50% 85%;
  animation: dpa-doze 5.2s ease-in-out infinite;
}

.dpa--idle:hover .dpa-ring,
.dpa--idle:focus-visible .dpa-ring {
  opacity: 0.95;
  animation-play-state: paused;
}

.dpa--idle:hover .dpa-zzz,
.dpa--idle:focus-visible .dpa-zzz {
  opacity: 0;
}

.dpa-arc {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: #a3b7cf;
  border-right-color: rgba(163, 183, 207, 0.3);
  animation: dpa-spin 1.6s cubic-bezier(0.45, 0.1, 0.55, 0.9) infinite;
}

.dpa-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  animation: dpa-pop 360ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dpa-badge i {
  font-size: 10px;
}

.dpa-badge--run {
  background: #a3b7cf;
  color: #14171d;
}

.dpa-badge--ok {
  background: #7fc29b;
  color: #14171d;
}

.dpa-badge--fail {
  background: #f0a3a3;
  color: #2a1212;
}

.dpa-zzz {
  position: absolute;
  top: 2px;
  left: 2px;
  display: flex;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: var(--moon-opacity-60);
  pointer-events: none;
  transition: opacity 200ms ease;
}

.dpa-z {
  position: absolute;
  bottom: 0;
  left: 0;
  opacity: 0;
  animation: dpa-z-float 3.6s ease-out infinite;
}

/* 负延迟让三个 z 一开始就错开，不会同时出现 */
.dpa-z:nth-child(2) {
  animation-delay: -1.2s;
}

.dpa-z:nth-child(3) {
  animation-delay: -2.4s;
}

@keyframes dpa-enter {
  0% {
    opacity: 0.3;
    transform: scale(0.7);
  }
  60% {
    opacity: 1;
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes dpa-pop {
  0% {
    transform: scale(0.3);
  }
  70% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes dpa-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes dpa-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.04);
  }
}

@keyframes dpa-glow {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(163, 183, 207, 0);
  }
  50% {
    box-shadow: 0 0 14px 2px rgba(163, 183, 207, 0.35);
  }
}

/* 埋头干活：左右轻摇、偶尔点一下头 */
@keyframes dpa-work {
  0%,
  100% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(-5deg);
  }
  50% {
    transform: rotate(0deg) scale(0.98);
  }
  75% {
    transform: rotate(5deg);
  }
}

/* 开心蹦一下：蓄力压扁 → 跳起 → 落地回弹，然后歇一会儿 */
@keyframes dpa-hop {
  0%,
  28%,
  100% {
    transform: translateY(0) scale(1);
  }
  6% {
    transform: translateY(0) scale(1.06, 0.92);
  }
  13% {
    transform: translateY(-8px) scale(0.96, 1.05);
  }
  20% {
    transform: translateY(0) scale(1.05, 0.95);
  }
}

/* 摇摇头，然后歇一会儿 */
@keyframes dpa-shake {
  0%,
  24%,
  100% {
    transform: rotate(0deg);
  }
  4% {
    transform: rotate(-8deg);
  }
  9% {
    transform: rotate(7deg);
  }
  14% {
    transform: rotate(-5deg);
  }
  19% {
    transform: rotate(2deg);
  }
}

@keyframes dpa-ripple {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--dpa-ripple), 0.55);
  }
  70%,
  100% {
    box-shadow: 0 0 0 10px rgba(var(--dpa-ripple), 0);
  }
}

@keyframes dpa-z-float {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.6) rotate(-12deg);
  }
  20% {
    opacity: 0.85;
  }
  75% {
    opacity: 0.5;
  }
  100% {
    opacity: 0;
    transform: translate(-16px, -26px) scale(1.25) rotate(10deg);
  }
}

/* 打瞌睡：头慢慢垂下、停一下，再轻轻抬起 */
@keyframes dpa-doze {
  0%,
  100% {
    transform: translateY(0) rotate(0deg) scale(1);
  }
  40%,
  58% {
    transform: translateY(1.5px) rotate(-6deg) scale(0.98);
  }
  72% {
    transform: translateY(-1px) rotate(1.5deg) scale(1.02);
  }
}

/* 减少动态效果：保留颜色与角标，关掉所有动画，zzz 静止显示 */
@media (prefers-reduced-motion: reduce) {
  .dpa,
  .dpa-ring,
  .dpa-face,
  .dpa-arc,
  .dpa-badge {
    animation: none !important;
    transition: none;
  }

  .dpa:hover,
  .dpa:focus-visible {
    transform: none;
  }

  .dpa-zzz {
    top: -10px;
    left: -14px;
  }

  .dpa-z {
    position: static;
    opacity: 0.6;
    animation: none;
  }
}
</style>
