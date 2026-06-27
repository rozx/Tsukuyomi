<template>
  <div class="p-3 rounded-lg border border-white/10 bg-white/5">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center cursor-pointer" @click="enabled = !enabled">
        <Checkbox
          :id="checkboxId"
          :model-value="enabled"
          :binary="true"
          @click.stop
          @update:model-value="enabled = $event"
        />
        <label :for="checkboxId" class="ml-2 text-sm cursor-pointer">{{ label }}</label>
      </div>
      <span
        v-if="enabled"
        class="text-sm font-medium text-accent-400 px-2 py-0.5 bg-accent-400/10 rounded"
      >
        {{ temperature }}
      </span>
    </div>
    <div v-if="enabled" class="mt-2">
      <Slider
        :id="sliderId"
        :model-value="temperature"
        :min="0"
        :max="2"
        :step="0.1"
        class="w-full"
        @update:model-value="onTemperatureUpdate"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Checkbox from 'primevue/checkbox';
import Slider from 'primevue/slider';

const props = defineProps<{
  label: string;
  idPrefix: string;
  idSuffix: string;
}>();

// 双向绑定：任务启用状态与温度（通过 defineModel 避免 prop 突变）
const enabled = defineModel<boolean>('enabled', { required: true });
const temperature = defineModel<number>('temperature', { required: true });

// PrimeVue Slider 的 update:model-value 可能返回 number | number[]，统一收敛为单值
const onTemperatureUpdate = (value: number | number[]) => {
  temperature.value = Array.isArray(value) ? (value[0] ?? 0) : value;
};

const checkboxId = computed(() => `${props.idPrefix}-default-${props.idSuffix}`);
const sliderId = computed(() => `${props.idPrefix}-temperature-${props.idSuffix}`);
</script>
