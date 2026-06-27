<script setup lang="ts">
/**
 * 代理设置 · 代理列表 DataTable（拖拽排序 + 测试 / 编辑 / 删除）。
 * 从 ProxySettingsTab 抽出以降低其模板复杂度。状态来自 injectProxySettings()。
 */
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import { injectProxySettings } from 'src/composables/settings/useProxySettings';

const s = injectProxySettings();
</script>

<template>
  <div class="proxy-table-wrapper">
    <DataTable
      :value="s.proxyList.value"
      :paginator="false"
      class="proxy-data-table text-xs"
      tableStyle="min-width: 44rem"
      row-reorder
      @row-reorder="s.onRowReorder"
    >
      <Column row-reorder-header="拖拽排序" :row-reorder="true" style="width: 3rem" />
      <Column field="name" header="名称" class="text-xs">
        <template #body="{ data }">
          <span class="font-medium">{{ data.name }}</span>
        </template>
      </Column>
      <Column field="url" header="URL" class="text-xs">
        <template #body="{ data }">
          <span class="text-moon/70 text-xs break-all">{{ data.url }}</span>
        </template>
      </Column>
      <Column field="description" header="描述" class="text-xs">
        <template #body="{ data }">
          <span v-if="data.description" class="text-xs text-moon/60">{{ data.description }}</span>
          <span v-else class="text-xs text-moon/40 italic">无描述</span>
        </template>
      </Column>
      <Column header="操作" class="text-xs" style="width: 150px">
        <template #body="{ data }">
          <div class="flex gap-1 flex-nowrap">
            <Button
              icon="pi pi-send"
              size="small"
              severity="info"
              text
              rounded
              aria-label="测试代理"
              :title="s.testProxyTitle(data.id)"
              :loading="s.isTestingProxy(data.id)"
              :disabled="s.isTestingProxy(data.id)"
              @click="s.testProxy(data)"
            />
            <Button
              icon="pi pi-pencil"
              size="small"
              severity="secondary"
              text
              rounded
              aria-label="编辑代理"
              title="编辑"
              @click="s.openEditProxyDialog(data)"
            />
            <Button
              icon="pi pi-trash"
              size="small"
              severity="danger"
              text
              rounded
              aria-label="删除代理"
              title="删除"
              @click="s.deleteProxy(data.id)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
