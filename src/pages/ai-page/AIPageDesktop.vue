<script setup lang="ts">
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import Tag from 'primevue/tag';
import InputText from 'primevue/inputtext';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import ProgressSpinner from 'primevue/progressspinner';
import { injectAIPage } from 'src/composables/ai-page/useAIPage';

const ctx = injectAIPage();
</script>

<template>
  <div class="h-full flex flex-col p-3 sm:p-4 lg:p-6">
    <div
      class="flex flex-col md:flex-row md:items-center md:justify-between mb-4 sm:mb-6 flex-shrink-0 gap-3"
    >
      <div class="flex-shrink-0 min-w-0">
        <h1 class="text-2xl font-bold">AI 模型管理</h1>
        <p class="text-moon/70 mt-1">管理可用的 AI 翻译模型配置</p>
      </div>
      <div class="flex w-full md:w-auto items-center gap-2 sm:gap-3 flex-wrap md:flex-nowrap">
        <InputGroup class="search-input-group min-w-0 flex-shrink w-full md:w-auto">
          <InputGroupAddon>
            <i class="pi pi-search text-base" />
          </InputGroupAddon>
          <InputText
            v-model="ctx.searchQuery.value"
            placeholder="搜索模型名称、提供商、模型类型或默认任务..."
            class="search-input"
          />
          <InputGroupAddon v-if="ctx.searchQuery.value" class="input-action-addon">
            <Button
              icon="pi pi-times"
              class="p-button-text p-button-sm input-action-button"
              title="清除搜索"
              @click="ctx.searchQuery.value = ''"
            />
          </InputGroupAddon>
        </InputGroup>
        <Button
          label="添加 AI 模型"
          icon="pi pi-plus"
          class="p-button-primary icon-button-hover flex-shrink-0 w-full sm:w-auto"
          @click="ctx.addModel"
        />
      </div>
    </div>

    <div class="flex-1 flex flex-col min-h-0">
      <div v-if="ctx.isPageLoading.value" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <ProgressSpinner
            style="width: 50px; height: 50px"
            stroke-width="4"
            animation-duration=".8s"
            aria-label="加载中"
          />
          <p class="text-moon/70 mt-4">正在加载 AI 模型...</p>
        </div>
      </div>
      <DataView
        v-else
        :value="ctx.filteredModels.value"
        data-key="id"
        :rows="10"
        :paginator="ctx.filteredModels.value.length > 0"
        :rows-per-page-options="[5, 10, 20, 50]"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
        class="flex-1 flex flex-col min-h-0"
      >
        <template #empty>
          <div class="text-center py-12">
            <i class="pi pi-sparkles text-4xl text-moon/50 mb-4 icon-hover" />
            <p class="text-moon/70">
              {{ ctx.searchQuery.value ? '未找到匹配的 AI 模型' : '暂无配置的 AI 模型' }}
            </p>
            <Button
              v-if="!ctx.searchQuery.value"
              label="添加第一个 AI 模型"
              icon="pi pi-plus"
              class="p-button-primary mt-4 icon-button-hover"
              @click="ctx.addModel"
            />
          </div>
        </template>

        <template #list="slotProps">
          <div class="grid grid-cols-1 gap-4">
            <div
              v-for="model in slotProps.items"
              :key="model.id"
              class="bg-white/3 border border-white/10 rounded-lg overflow-hidden hover:bg-white/5 transition-colors"
            >
              <div class="p-4 border-b border-white/10">
                <div
                  class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <i
                      class="pi pi-sparkles text-xl icon-hover"
                      :class="model.enabled ? 'text-accent-400' : 'text-moon/50'"
                    />
                    <div class="min-w-0">
                      <h3 class="text-lg font-semibold truncate">{{ model.name }}</h3>
                      <p class="text-sm text-moon/70 truncate">
                        {{ ctx.getProviderLabel(model.provider) }} · {{ model.model }}
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <Tag
                      :value="model.enabled ? '已启用' : '已禁用'"
                      :severity="model.enabled ? 'success' : 'secondary'"
                    />
                    <Button
                      icon="pi pi-copy"
                      class="p-button-text p-button-sm icon-button-hover"
                      @click="ctx.duplicateModel(model)"
                    />
                    <Button
                      icon="pi pi-pencil"
                      class="p-button-text p-button-sm icon-button-hover"
                      @click="ctx.editModel(model)"
                    />
                    <Button
                      icon="pi pi-trash"
                      class="p-button-text p-button-sm p-button-danger icon-button-hover"
                      @click="ctx.deleteModel(model)"
                    />
                  </div>
                </div>
              </div>

              <div class="p-4 space-y-3">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                  <div>
                    <span class="text-moon/70">温度:</span>
                    <span class="ml-2">{{ model.temperature }}</span>
                  </div>
                  <div>
                    <span class="text-moon/70">上下文窗口:</span>
                    <span class="ml-2">{{ model.maxInputTokens }}</span>
                  </div>
                  <div>
                    <span class="text-moon/70">最大输出 Token:</span>
                    <span class="ml-2">{{ model.maxOutputTokens }}</span>
                  </div>
                  <div>
                    <span class="text-moon/70">API Key:</span>
                    <span class="ml-2 font-mono text-xs">
                      {{ ctx.formatApiKey(model.apiKey) }}
                    </span>
                  </div>
                  <div>
                    <span class="text-moon/70">基础地址:</span>
                    <span class="ml-2 font-mono text-xs">{{ model.baseUrl }}</span>
                  </div>
                </div>
                <div class="pt-2 border-t border-white/10">
                  <span class="text-moon/70 text-sm">默认任务:</span>
                  <span class="ml-2 text-sm">{{ ctx.getDefaultTasks(model) }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </DataView>
    </div>
  </div>
</template>

<style scoped>
:deep(.p-dataview) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: transparent !important;
}

:deep(.p-dataview-content) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  background: transparent !important;
}

:deep(.p-paginator) {
  flex-shrink: 0;
  margin-top: auto;
}

.search-input-group {
  min-width: 0;
  flex: 1 1 auto;
  max-width: 400px;
}

.search-input-group :deep(.p-inputtext) {
  min-width: 0;
}
</style>
