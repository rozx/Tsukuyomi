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
    class="search-toolbar border-b border-white/10 bg-white/5 backdrop-blur-md p-2 px-6 animate-fade-in"
  >
    <!-- Search Row -->
    <div class="search-toolbar-row">
      <div class="search-input-group">
        <div class="relative flex-1">
          <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-moon/50 text-sm"></i>
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

        <div class="flex gap-1 flex-shrink-0">
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
      </div>

      <div class="search-toolbar-actions">
        <Button
          :icon="showReplace ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
          :label="showReplace ? '隐藏替换' : '替换'"
          text
          size="small"
          class="!text-xs !px-2"
          @click="emit('update:showReplace', !showReplace)"
        />
        <Button
          icon="pi pi-times"
          text
          rounded
          size="small"
          class="!w-8 !h-8 text-moon/50 hover:text-moon"
          @click="emit('update:visible', false)"
        />
      </div>
    </div>

    <!-- Replace Row -->
    <div v-if="showReplace" class="replace-toolbar-row animate-fade-in">
      <div class="relative flex-1 min-w-0">
        <i class="pi pi-pencil absolute left-3 top-1/2 -translate-y-1/2 text-moon/50 text-sm"></i>
        <InputText
          :value="replaceQuery"
          @input="handleReplaceInput"
          placeholder="替换为...（留空可删除）"
          class="!pl-9 !py-1.5 !text-sm w-full"
          @keydown.enter="emit('replace')"
        />
      </div>

      <div class="flex gap-2 flex-shrink-0">
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
  </div>
</template>

<style scoped>
.search-toolbar-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.search-input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.search-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.replace-toolbar-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

@media (max-width: 640px) {
  .search-toolbar {
    padding-left: 0.75rem !important;
    padding-right: 0.75rem !important;
  }

  .search-toolbar-row {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .search-input-group {
    flex: 1 1 100%;
    min-width: 0;
  }

  .search-toolbar-actions {
    flex: 1 1 100%;
    justify-content: flex-end;
  }

  .replace-toolbar-row {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .replace-toolbar-row > .relative {
    flex: 1 1 100%;
  }

  .replace-toolbar-row > .flex {
    flex: 1 1 100%;
    justify-content: flex-end;
  }
}
</style>
