<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <div class="text-sm font-medium text-moon/90">封面历史</div>
      <div class="text-xs text-moon/60">{{ covers.length }} 个封面</div>
    </div>
    <div
      v-if="covers.length > 0"
      class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 max-h-96 overflow-y-auto p-2 border border-white/10 rounded-lg"
    >
      <div
        v-for="cover in covers"
        :key="cover.id"
        :class="[
          'relative aspect-[2/3] overflow-hidden rounded-lg border-2 cursor-pointer transition-all group',
          selectedCoverId === cover.id
            ? 'border-primary ring-2 ring-primary/50'
            : 'border-white/10 hover:border-white/30 hover:ring-1 hover:ring-white/20',
        ]"
        role="button"
        tabindex="0"
        :aria-pressed="selectedCoverId === cover.id"
        @click="emit('select', cover)"
        @keydown.enter.prevent="emit('select', cover)"
        @keydown.space.prevent="emit('select', cover)"
      >
        <img
          :src="cover.url"
          alt="封面"
          class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          @error="
            (e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }
          "
        />
        <div
          v-if="selectedCoverId === cover.id"
          class="absolute inset-0 flex items-center justify-center bg-primary/20 backdrop-blur-sm"
        >
          <i class="pi pi-check-circle text-primary text-2xl drop-shadow-lg" />
        </div>
        <!-- 悬停时的选中提示 -->
        <div
          v-if="selectedCoverId !== cover.id"
          class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <i class="pi pi-check text-white text-lg" />
        </div>
      </div>
    </div>
    <div v-else class="text-center py-8 text-moon/60 text-sm">暂无封面历史记录</div>
  </div>
</template>

<script setup lang="ts">
import type { CoverImage } from 'src/models/novel';

defineProps<{
  covers: Array<CoverImage & { id: string }>;
  selectedCoverId: string | null;
}>();

const emit = defineEmits<{
  select: [cover: CoverImage & { id: string }];
}>();
</script>
