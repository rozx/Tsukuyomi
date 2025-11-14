<script setup lang="ts">
import { ref, computed, useSlots } from 'vue';
import Button from 'primevue/button';

export type MessageSeverity = 'success' | 'error' | 'info' | 'warn';

export interface MessageDetail {
  label: string;
  value: string | number;
}

const props = withDefaults(
  defineProps<{
    severity?: MessageSeverity;
    message?: string;
    title?: string;
    icon?: string;
    closable?: boolean;
    detail?: MessageDetail[];
  }>(),
  {
    severity: 'info',
    closable: true,
    detail: () => [],
  }
);

const emit = defineEmits<{
  close: [];
}>();

const slots = useSlots();
const visible = ref(true);

const severityClasses = computed(() => {
  const classes: Record<MessageSeverity, string> = {
    success: 'bg-green-500/10 border-green-500/30 text-green-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    warn: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  };
  return classes[props.severity];
});

const messageClasses = computed(() => {
  const classes: Record<MessageSeverity, string> = {
    success: 'text-moon/90',
    error: 'text-moon/90',
    info: 'text-moon/90',
    warn: 'text-moon/90',
  };
  return classes[props.severity];
});

const detailLabelClasses = computed(() => 'text-moon/70');
const detailValueClasses = computed(() => 'text-moon/90 font-mono');

const defaultIcons: Record<MessageSeverity, string> = {
  success: 'pi pi-check-circle',
  error: 'pi pi-times-circle',
  info: 'pi pi-info-circle',
  warn: 'pi pi-exclamation-triangle',
};

const icon = computed(() => props.icon || defaultIcons[props.severity]);

const hasMessage = computed(() => props.message || !!slots.default);
const hasContent = computed(() => !!slots.content || (props.detail && props.detail.length > 0));

const handleClose = () => {
  visible.value = false;
  emit('close');
};
</script>

<template>
  <Transition name="message">
    <div v-if="visible" class="space-y-2">
      <div
        :class="[
          'p-4 rounded-lg border',
          severityClasses,
        ]"
      >
        <div class="flex items-start gap-3">
          <i
            v-if="icon"
            :class="[icon, 'text-lg mt-0.5 flex-shrink-0']"
          />
          <div class="flex-1 min-w-0">
            <p v-if="title || $slots.title" class="font-medium mb-1">
              <slot name="title">{{ title }}</slot>
            </p>
            <p v-if="hasMessage" :class="['text-sm', messageClasses, { 'mb-3': hasContent }]">
              <slot>{{ message }}</slot>
            </p>
            <div v-if="hasContent" class="mt-3 pt-3 border-t border-white/10 space-y-2 text-xs">
              <slot name="content">
                <div
                  v-for="(item, index) in detail"
                  :key="index"
                  class="flex justify-between items-center"
                >
                  <span :class="detailLabelClasses">{{ item.label }}</span>
                  <span :class="detailValueClasses">{{ item.value }}</span>
                </div>
              </slot>
            </div>
          </div>
          <Button
            v-if="closable"
            icon="pi pi-times"
            class="p-button-text p-button-sm p-button-rounded flex-shrink-0"
            @click="handleClose"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.message-enter-active,
.message-leave-active {
  transition: all 0.3s ease;
}

.message-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.message-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
