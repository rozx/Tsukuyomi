<template>
  <AgentMcpPanel :title="t('agentMcp.permission.title')">
    <div class="perm-list" role="radiogroup" :aria-label="t('agentMcp.permission.title')">
      <button
        v-for="option in ctx.permissionOptions.value"
        :key="option.value"
        type="button"
        role="radio"
        class="perm-option"
        :class="{
          'perm-option--active': ctx.settings.value.permissionMode === option.value,
          'perm-option--danger': option.danger,
        }"
        :aria-checked="ctx.settings.value.permissionMode === option.value"
        @click="ctx.requestPermissionMode(option.value)"
      >
        <span class="perm-head">
          <span class="perm-label">{{ option.label }}</span>
          <Tag
            v-if="option.recommended"
            :value="t('agentMcp.permission.recommended')"
            severity="info"
          />
          <span class="perm-count">
            {{ t('agentMcp.permission.toolCount', { count: option.toolCount }) }}
          </span>
        </span>
        <span class="perm-desc">{{ option.description }}</span>
      </button>
    </div>

    <!-- 完全控制允许删书，切换前要求再确认一次 -->
    <div v-if="ctx.pendingFullPermission.value" class="amcp-confirm" role="alertdialog">
      <span class="amcp-confirm-title">{{ t('agentMcp.permission.fullConfirmTitle') }}</span>
      <p class="amcp-confirm-body">{{ t('agentMcp.permission.fullConfirmBody') }}</p>
      <div class="amcp-confirm-actions">
        <Button
          :label="t('agentMcp.permission.cancel')"
          size="small"
          text
          severity="secondary"
          @click="ctx.cancelFullPermission"
        />
        <Button
          :label="t('agentMcp.permission.fullConfirmAccept')"
          size="small"
          severity="danger"
          @click="ctx.confirmFullPermission"
        />
      </div>
    </div>

    <hr class="amcp-divider" />

    <div class="amcp-field">
      <label class="amcp-label" for="amcp-write-mode">{{
        t('agentMcp.permission.writeMode')
      }}</label>
      <Select
        input-id="amcp-write-mode"
        :model-value="ctx.settings.value.defaultWriteMode"
        :options="writeModeOptions"
        option-label="label"
        option-value="value"
        class="w-full"
        @update:model-value="ctx.setDefaultWriteMode"
      />
    </div>

    <div class="amcp-row">
      <div class="amcp-panel-copy">
        <div class="amcp-label">{{ t('agentMcp.permission.notifyOnWrite') }}</div>
        <p class="amcp-hint">{{ t('agentMcp.permission.notifyOnWriteHint') }}</p>
      </div>
      <ToggleSwitch
        :model-value="ctx.settings.value.notifyOnWrite"
        :aria-label="t('agentMcp.permission.notifyOnWrite')"
        @update:model-value="ctx.setNotifyOnWrite"
      />
    </div>
  </AgentMcpPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import ToggleSwitch from 'primevue/toggleswitch';
import AgentMcpPanel from 'src/components/agent-mcp/AgentMcpPanel.vue';
import { injectAgentMcpPage } from 'src/composables/agent-mcp-page/useAgentMcpPage';
import type { AgentMcpWriteMode } from 'src/models/settings';

const { t } = useI18n();
const ctx = injectAgentMcpPage();

const writeModeOptions = computed<Array<{ label: string; value: AgentMcpWriteMode }>>(() => [
  { label: t('agentMcp.permission.writeAppend'), value: 'append' },
  { label: t('agentMcp.permission.writeOverwrite'), value: 'overwrite' },
]);
</script>

<style scoped>
.perm-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.perm-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--white-opacity-8);
  background: var(--white-opacity-3);
  text-align: left;
  cursor: pointer;
}

.perm-option:focus-visible {
  outline: 2px solid var(--tsukuyomi-opacity-40);
  outline-offset: 2px;
}

.perm-option--active {
  background: var(--tsukuyomi-opacity-14);
  border-color: var(--tsukuyomi-opacity-40);
}

.perm-option--danger.perm-option--active {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.45);
}

.perm-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.perm-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
}

.perm-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  white-space: nowrap;
}

.perm-desc {
  font-size: 12px;
  line-height: 1.5;
  color: var(--moon-50-opacity-65);
}
</style>
