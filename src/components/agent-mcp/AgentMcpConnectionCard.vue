<template>
  <section class="mcp-card">
    <header class="mcp-card-head">
      <h2 class="mcp-card-title">{{ t('agentMcp.connection.title') }}</h2>
      <Tag :value="ctx.runtimeStatusLabel.value" :severity="ctx.runtimeStatusSeverity.value" />
    </header>

    <!-- Electron 本地 MCP 服务端控制（仅桌面版显示） -->
    <div v-if="ctx.isElectronEnv.value" class="mcp-block">
      <div class="mcp-row">
        <div class="mcp-row-copy">
          <div class="mcp-row-title">{{ t('agentMcp.connection.desktopTitle') }}</div>
          <p class="mcp-row-hint">{{ t('agentMcp.connection.desktopHint') }}</p>
        </div>
        <ToggleSwitch
          :model-value="ctx.settings.value.desktopServerEnabled"
          :aria-label="t('agentMcp.connection.enableDesktop')"
          @update:model-value="ctx.toggleDesktopServer"
        />
      </div>

      <div v-if="ctx.desktopServerStatus.value.error" class="mcp-alert mcp-alert--error">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        <span>{{ ctx.desktopServerStatus.value.error }}</span>
      </div>

      <div class="mcp-field">
        <label class="mcp-label">{{ t('agentMcp.connection.endpoint') }}</label>
        <div class="mcp-inline">
          <code class="mcp-code-pill">{{ ctx.endpointUrl.value }}</code>
          <Button
            icon="pi pi-copy"
            class="p-button-text p-button-sm"
            :title="t('agentMcp.quickConnect.copySnippet')"
            @click="ctx.copyEndpoint"
          />
        </div>
      </div>

      <div class="mcp-field">
        <label class="mcp-label">{{ t('agentMcp.connection.port') }}</label>
        <div class="mcp-inline">
          <InputNumber
            v-model="ctx.portDraft.value"
            :min="1024"
            :max="65535"
            :use-grouping="false"
            class="mcp-port-input"
          />
          <Button
            :label="t('agentMcp.connection.savePort')"
            size="small"
            outlined
            @click="ctx.applyPort"
          />
        </div>
      </div>

      <div class="mcp-field">
        <label class="mcp-label">{{ t('agentMcp.connection.token') }}</label>
        <div class="mcp-inline mcp-inline--wrap">
          <code class="mcp-code-pill mcp-code-pill--grow">{{ ctx.maskedToken.value }}</code>
          <Button
            :label="
              ctx.tokenRevealed.value
                ? t('agentMcp.connection.hideToken')
                : t('agentMcp.connection.showToken')
            "
            size="small"
            text
            @click="ctx.tokenRevealed.value = !ctx.tokenRevealed.value"
          />
          <Button
            :label="t('agentMcp.connection.copyToken')"
            icon="pi pi-copy"
            size="small"
            outlined
            @click="ctx.copyToken"
          />
          <Button
            :label="t('agentMcp.connection.regenerateToken')"
            icon="pi pi-refresh"
            size="small"
            severity="secondary"
            outlined
            @click="ctx.regenerateToken"
          />
        </div>
        <p class="mcp-row-hint">{{ t('agentMcp.connection.regenerateHint') }}</p>
      </div>
    </div>

    <!-- 浏览器 WebMCP 控制（仅 Web 版显示） -->
    <div v-if="!ctx.isElectronEnv.value" class="mcp-block">
      <div class="mcp-row">
        <div class="mcp-row-copy">
          <div class="mcp-row-title">{{ t('agentMcp.connection.webTitle') }}</div>
          <p class="mcp-row-hint">{{ t('agentMcp.connection.webHint') }}</p>
        </div>
        <ToggleSwitch
          :model-value="ctx.settings.value.webMcpEnabled"
          :aria-label="t('agentMcp.connection.enableWebMcp')"
          @update:model-value="ctx.toggleWebMcp"
        />
      </div>

      <div class="mcp-inline">
        <Tag
          :value="ctx.webAvailabilityLabel.value"
          :severity="ctx.webAvailabilitySeverity.value"
        />
      </div>

      <div
        v-if="ctx.webMcpStatus.value.availability === 'unavailable'"
        class="mcp-alert mcp-alert--info"
      >
        <i class="pi pi-info-circle" aria-hidden="true" />
        <span>{{ t('agentMcp.connection.webUnavailableHint') }}</span>
      </div>
    </div>

    <!-- 通用权限与写入策略 -->
    <div class="mcp-block mcp-block--divider">
      <div class="mcp-row-title">{{ t('agentMcp.connection.safetyTitle') }}</div>

      <div class="mcp-field">
        <label class="mcp-label">{{ t('agentMcp.connection.permissionMode') }}</label>
        <Select
          :model-value="ctx.settings.value.permissionMode"
          :options="permissionOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          @update:model-value="ctx.setPermissionMode"
        />
      </div>

      <div class="mcp-field">
        <label class="mcp-label">{{ t('agentMcp.connection.defaultWriteMode') }}</label>
        <Select
          :model-value="ctx.settings.value.defaultWriteMode"
          :options="writeModeOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          @update:model-value="ctx.setDefaultWriteMode"
        />
      </div>

      <div class="mcp-row">
        <div class="mcp-row-copy">
          <div class="mcp-label">{{ t('agentMcp.connection.notifyOnWrite') }}</div>
          <p class="mcp-row-hint">{{ t('agentMcp.connection.notifyOnWriteHint') }}</p>
        </div>
        <ToggleSwitch
          :model-value="ctx.settings.value.notifyOnWrite"
          :aria-label="t('agentMcp.connection.notifyOnWrite')"
          @update:model-value="ctx.setNotifyOnWrite"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import ToggleSwitch from 'primevue/toggleswitch';
import { injectAgentMcpPage } from 'src/composables/agent-mcp-page/useAgentMcpPage';

const { t } = useI18n();
const ctx = injectAgentMcpPage();

const permissionOptions = computed(() => [
  { label: t('agentMcp.connection.permissionReadOnly'), value: 'read_only' },
  { label: t('agentMcp.connection.permissionTranslateEdit'), value: 'translate_and_edit' },
  { label: t('agentMcp.connection.permissionFull'), value: 'full' },
]);

const writeModeOptions = computed(() => [
  { label: t('agentMcp.connection.writeAppend'), value: 'append' },
  { label: t('agentMcp.connection.writeOverwrite'), value: 'overwrite' },
]);
</script>

<style scoped>
.mcp-card {
  padding: 18px 20px;
  border-radius: 14px;
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-8);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mcp-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mcp-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
}

.mcp-block {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mcp-block--divider {
  padding-top: 14px;
  border-top: 1px solid var(--white-opacity-6);
}

.mcp-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.mcp-row-copy {
  flex: 1;
  min-width: 0;
}

.mcp-row-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--moon-50-opacity-92);
}

.mcp-row-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--moon-50-opacity-55);
}

.mcp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mcp-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--moon-50-opacity-78);
}

.mcp-inline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mcp-inline--wrap {
  flex-wrap: wrap;
}

.mcp-code-pill {
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--white-opacity-8);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--tsukuyomi-200);
  word-break: break-all;
}

.mcp-code-pill--grow {
  flex: 1;
  min-width: 180px;
}

.mcp-port-input {
  width: 120px;
}

.mcp-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.5;
}

.mcp-alert--error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
}

.mcp-alert--info {
  background: var(--tsukuyomi-opacity-8);
  border: 1px solid var(--tsukuyomi-opacity-25);
  color: var(--tsukuyomi-200);
}
</style>
