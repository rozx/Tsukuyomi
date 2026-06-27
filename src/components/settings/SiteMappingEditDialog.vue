<script setup lang="ts">
/**
 * 代理设置 · 编辑网站-代理映射对话框（已选代理排序 + 可用代理添加）。
 * 从 ProxySettingsTab 抽出以降低其模板复杂度。状态来自 injectProxySettings()。
 */
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';
import Tag from 'primevue/tag';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import { injectProxySettings } from 'src/composables/settings/useProxySettings';

const s = injectProxySettings();
</script>

<template>
  <AdaptiveDialog
    :visible="s.showEditSiteMappingDialog.value"
    header="编辑网站-代理映射"
    desktop-width="min(700px, 94vw)"
    eyebrow="MAPPING"
    @update:visible="(next) => { if (!next) s.cancelEditSiteMapping(); }"
  >
    <div v-if="s.editingSiteMapping.value" class="space-y-4">
      <div>
        <p class="text-sm text-moon/80 mb-2">
          网站：<span class="font-medium">{{ s.editingSiteMapping.value.site }}</span>
        </p>
      </div>

      <div class="flex items-center justify-between">
        <label class="text-xs text-moon/80">启用此映射规则</label>
        <ToggleSwitch v-model="s.enabledForEdit.value" />
      </div>

      <div class="border-t border-moon/20 pt-3">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-medium text-moon/90">已选择的代理</h4>
          <span class="text-xs text-moon/60">{{ s.selectedProxiesForEdit.value.length }}/3</span>
        </div>
        <div v-if="s.hasSelectedProxies.value" class="text-xs text-moon/60 italic mb-3">
          暂无代理，请从下方添加（最多 3 个）
        </div>
        <div v-else class="space-y-2 mb-3">
          <div
            v-for="(proxyUrl, index) in s.selectedProxiesForEdit.value"
            :key="index"
            class="flex items-center gap-2 p-2 bg-white/5 rounded border border-white/10"
          >
            <div class="flex-1 flex items-center gap-2">
              <span class="text-xs text-moon/60 w-6">{{ index + 1 }}</span>
              <Tag :value="s.getProxyDisplayName(proxyUrl)" severity="info" class="text-xs flex-1" />
            </div>
            <div class="flex gap-1">
              <Button
                icon="pi pi-arrow-up"
                size="small"
                severity="secondary"
                text
                rounded
                :disabled="index === 0"
                title="上移"
                @click="s.moveProxyUp(index)"
              />
              <Button
                icon="pi pi-arrow-down"
                size="small"
                severity="secondary"
                text
                rounded
                :disabled="index === s.selectedProxiesForEdit.value.length - 1"
                title="下移"
                @click="s.moveProxyDown(index)"
              />
              <Button
                icon="pi pi-times"
                size="small"
                severity="danger"
                text
                rounded
                title="移除"
                @click="s.removeProxyFromMapping(proxyUrl)"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-moon/20 pt-3">
        <h4 class="text-sm font-medium text-moon/90 mb-3">可用代理</h4>
        <div v-if="s.hasAvailableProxies.value" class="text-xs text-moon/60 italic">所有代理已添加</div>
        <div v-else class="space-y-2">
          <div
            v-for="proxy in s.availableProxiesForEdit.value"
            :key="proxy.id"
            class="flex items-center justify-between p-2 bg-white/5 rounded border border-white/10"
          >
            <div class="flex-1">
              <div class="text-sm font-medium">{{ proxy.name }}</div>
              <div v-if="proxy.description" class="text-xs text-moon/60">{{ proxy.description }}</div>
              <div class="text-xs text-moon/50 mt-1 break-all">{{ proxy.url }}</div>
            </div>
            <Button
              icon="pi pi-plus"
              size="small"
              severity="success"
              text
              rounded
              :title="`添加 ${proxy.name}`"
              :disabled="s.selectedProxiesFull.value"
              @click="s.addProxyToMapping(proxy.url)"
            />
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-3 border-t border-moon/20">
        <Button label="取消" size="small" text @click="s.cancelEditSiteMapping" />
        <Button label="保存" size="small" @click="s.confirmEditSiteMapping" />
      </div>
    </div>
  </AdaptiveDialog>
</template>
