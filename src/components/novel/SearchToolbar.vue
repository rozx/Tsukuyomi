<script setup lang="ts">
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';

const props = defineProps<{
  visible: boolean;
  searchQuery: string;
  replaceQuery: string;
  showReplace: boolean;
  matchesCount: number;
  currentMatchIndex: number;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'update:searchQuery', value: string): void;
  (e: 'update:replaceQuery', value: string): void;
  (e: 'update:showReplace', value: boolean): void;
  (e: 'next'): void;
  (e: 'prev'): void;
  (e: 'replace'): void;
  (e: 'replaceAll'): void;
}>();

const handleSearchInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:searchQuery', target.value);
};

const handleReplaceInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:replaceQuery', target.value);
};
</script>

<template>
  <div
    v-if="visible"
    class="search-toolbar border-b border-white/10 bg-white/5 backdrop-blur-md p-2 px-6 flex items-center gap-4 animate-fade-in"
  >
    <!-- Search Input -->
    <div class="flex items-center gap-2 flex-1 max-w-xl">
      <div class="relative flex-1">
        <i
          class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-moon/50 text-sm"
        ></i>
        <InputText
          :value="searchQuery"
          @input="handleSearchInput"
          placeholder="查找翻译内容..."
          class="!pl-9 !py-1.5 !text-sm w-full"
          @keydown.enter="emit('next')"
        />
        <span
          v-if="matchesCount > 0"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-moon/50"
        >
          {{ currentMatchIndex + 1 }}/{{ matchesCount }}
        </span>
      </div>

      <div class="flex gap-1">
        <Button
          icon="pi pi-angle-up"
          text
          rounded
          size="small"
          class="!w-8 !h-8"
          :disabled="matchesCount === 0"
          @click="emit('prev')"
        />
        <Button
          icon="pi pi-angle-down"
          text
          rounded
          size="small"
          class="!w-8 !h-8"
          :disabled="matchesCount === 0"
          @click="emit('next')"
        />
      </div>

      <Button
        :icon="showReplace ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
        :label="showReplace ? '隐藏替换' : '替换'"
        text
        size="small"
        class="!text-xs !px-2"
        @click="emit('update:showReplace', !showReplace)"
      />
    </div>

    <!-- Replace Input -->
    <div v-if="showReplace" class="flex items-center gap-2 flex-1 max-w-xl animate-fade-in">
      <div class="relative flex-1">
        <i
          class="pi pi-pencil absolute left-3 top-1/2 -translate-y-1/2 text-moon/50 text-sm"
        ></i>
        <InputText
          :value="replaceQuery"
          @input="handleReplaceInput"
          placeholder="替换为...（留空可删除）"
          class="!pl-9 !py-1.5 !text-sm w-full"
          @keydown.enter="emit('replace')"
        />
      </div>

      <div class="flex gap-2">
        <Button
          label="替换"
          size="small"
          outlined
          class="!text-xs !px-3 !py-1.5"
          :disabled="matchesCount === 0"
          @click="emit('replace')"
        />
        <Button
          label="全部替换"
          size="small"
          outlined
          class="!text-xs !px-3 !py-1.5"
          :disabled="matchesCount === 0"
          @click="emit('replaceAll')"
        />
      </div>
    </div>

    <!-- Close Button -->
    <Button
      icon="pi pi-times"
      text
      rounded
      size="small"
      class="!w-8 !h-8 ml-auto text-moon/50 hover:text-moon"
      @click="emit('update:visible', false)"
    />
  </div>
</template>

