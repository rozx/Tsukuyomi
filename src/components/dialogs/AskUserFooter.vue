<template>
  <div class="dialog-footer">
    <div class="footer-left">
      <Button
        v-if="isBatch"
        label="上一题"
        icon="pi pi-angle-left"
        severity="secondary"
        :disabled="!canPrev"
        @click="emit('prev')"
      />
      <Button
        v-if="isBatch"
        label="下一题"
        icon="pi pi-angle-right"
        icon-pos="right"
        severity="secondary"
        :disabled="!canNext"
        @click="emit('next')"
      />
    </div>

    <div class="footer-right">
      <Button
        :label="cancelLabel"
        icon="pi pi-times"
        severity="secondary"
        @click="emit('cancel')"
      />
      <Button
        v-if="showSubmitButton"
        :label="submitLabel"
        icon="pi pi-check"
        :disabled="!canSubmit"
        @click="emit('submit')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';

defineProps<{
  isBatch: boolean;
  canPrev: boolean;
  canNext: boolean;
  showSubmitButton: boolean;
  canSubmit: boolean;
  cancelLabel: string;
  submitLabel: string;
}>();

const emit = defineEmits<{
  prev: [];
  next: [];
  cancel: [];
  submit: [];
}>();
</script>

<style scoped>
.dialog-footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.footer-left,
.footer-right {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.footer-right {
  margin-left: auto;
  justify-content: flex-end;
}
</style>
