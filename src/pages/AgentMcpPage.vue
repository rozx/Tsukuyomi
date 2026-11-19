<template>
  <component :is="variantComponent" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import { provideAgentMcpPage } from 'src/composables/agent-mcp-page/useAgentMcpPage';
import AgentMcpDesktop from './agent-mcp/AgentMcpDesktop.vue';
import AgentMcpTablet from './agent-mcp/AgentMcpTablet.vue';
import AgentMcpMobile from './agent-mcp/AgentMcpMobile.vue';

provideAgentMcpPage();
const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return AgentMcpMobile;
    case 'tablet':
      return AgentMcpTablet;
    case 'desktop':
    default:
      return AgentMcpDesktop;
  }
});
</script>
