<script setup lang="ts">
/** 手机导入路由的聊天抽屉：沿用底部 sheet，内容为导入聊天外壳。 */
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import ImportChatHeader from './ImportChatHeader.vue';
import ImportChatBody from './ImportChatBody.vue';

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [value: boolean] }>();
</script>

<template>
  <MobileBottomSheet
    :visible="visible"
    title="月詠 · AI 导入"
    full-bleed
    @update:visible="(value: boolean) => emit('update:visible', value)"
  >
    <template #header="{ close }">
      <ImportChatHeader @close="close" />
    </template>
    <ImportChatBody safe-area />
  </MobileBottomSheet>
</template>
