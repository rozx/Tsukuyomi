<template>
  <!-- 端口与令牌只有桌面端本地服务需要；浏览器端不渲染 -->
  <AgentMcpPanel
    v-if="ctx.isElectronEnv.value"
    :title="t('agentMcp.connectionSettings.title')"
    :hint="t('agentMcp.connectionSettings.localOnly')"
  >
    <div class="amcp-field">
      <label class="amcp-label" for="amcp-port">{{ t('agentMcp.connectionSettings.port') }}</label>
      <div class="amcp-inline">
        <InputNumber
          v-model="ctx.portDraft.value"
          input-id="amcp-port"
          :min="1024"
          :max="65535"
          :use-grouping="false"
          class="port-input"
        />
        <Button
          :label="t('agentMcp.connectionSettings.savePort')"
          size="small"
          outlined
          @click="ctx.applyPort"
        />
      </div>
    </div>

    <div class="amcp-field">
      <span class="amcp-label">{{ t('agentMcp.connectionSettings.token') }}</span>
      <div class="amcp-inline">
        <code class="amcp-code">{{ ctx.maskedToken.value }}</code>
        <Button
          :icon="ctx.tokenRevealed.value ? 'pi pi-eye-slash' : 'pi pi-eye'"
          text
          size="small"
          :aria-label="tokenToggleLabel"
          :title="tokenToggleLabel"
          @click="ctx.tokenRevealed.value = !ctx.tokenRevealed.value"
        />
        <Button
          icon="pi pi-copy"
          text
          size="small"
          :aria-label="t('agentMcp.connectionSettings.copyToken')"
          :title="t('agentMcp.connectionSettings.copyToken')"
          @click="ctx.copyToken"
        />
      </div>
    </div>

    <!-- 重新生成会让已接入的客户端立即失效，单独成行并要求确认 -->
    <div v-if="ctx.regenerateArmed.value" class="amcp-confirm" role="alertdialog">
      <p class="amcp-confirm-body">{{ t('agentMcp.connectionSettings.regenerateConfirm') }}</p>
      <div class="amcp-confirm-actions">
        <Button
          :label="t('agentMcp.connectionSettings.cancel')"
          size="small"
          text
          severity="secondary"
          @click="ctx.cancelRegenerateToken"
        />
        <Button
          :label="t('agentMcp.connectionSettings.regenerateAccept')"
          size="small"
          severity="danger"
          @click="ctx.regenerateToken"
        />
      </div>
    </div>
    <Button
      v-else
      class="regenerate"
      :label="t('agentMcp.connectionSettings.regenerate')"
      icon="pi pi-refresh"
      size="small"
      text
      severity="secondary"
      @click="ctx.requestRegenerateToken"
    />
  </AgentMcpPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import AgentMcpPanel from 'src/components/agent-mcp/AgentMcpPanel.vue';
import { injectAgentMcpPage } from 'src/composables/agent-mcp-page/useAgentMcpPage';

const { t } = useI18n();
const ctx = injectAgentMcpPage();

const tokenToggleLabel = computed(() =>
  ctx.tokenRevealed.value
    ? t('agentMcp.connectionSettings.hideToken')
    : t('agentMcp.connectionSettings.showToken'),
);
</script>

<style scoped>
.port-input {
  flex: 1;
  min-width: 0;
}

.port-input :deep(input) {
  width: 100%;
}

.regenerate {
  align-self: flex-start;
}
</style>
