<script setup lang="ts">
/**
 * 应用前的确认摘要（挂在 dispatcher 上，只有一份）。数字全部来自比对结果；
 * 书籍在确认后被修改时，会话重算后再次打开并要求重新确认。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { confirm, target, confirmApply, cancelConfirm } = injectBookSync();

const visible = computed(() => confirm.value.stage !== 'closed');
const state = computed(() => (confirm.value.stage === 'closed' ? null : confirm.value));
const creating = computed(() => !!target.value && 'newFrom' in target.value);

function onVisible(value: boolean): void {
  if (!value) cancelConfirm();
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="creating ? '确认创建书籍' : '确认应用到书籍'"
    :closable="state?.stage !== 'applying'"
    :style="{ width: '28rem', maxWidth: 'calc(100vw - 2rem)' }"
    @update:visible="onVisible"
  >
    <div v-if="state" class="ac" data-testid="bsw-confirm">
      <div v-if="state.reconfirm" class="ac-reconfirm" role="alert">
        <i class="pi pi-history" aria-hidden="true" />
        书籍在你确认后被修改，以下是按最新内容重新计算的结果，请再次确认。
      </div>
      <ul class="ac-list">
        <li>
          新增 <strong>{{ state.summary.newCount }}</strong> 章
        </li>
        <li v-if="!creating">
          更新 <strong>{{ state.summary.updatedCount }}</strong> 章
        </li>
        <li v-if="!creating" :class="{ 'ac-loss': state.summary.clearedVersions > 0 }">
          <template v-if="state.summary.clearedVersions">
            将清空
            <strong>{{ state.summary.clearedVersions }}</strong> 个译文版本（原文被修订的段落）
          </template>
          <template v-else>不会清空已有译文</template>
        </li>
        <li v-for="title in state.summary.newVolumes" :key="title">新建卷「{{ title }}」</li>
      </ul>
      <p class="ac-note">应用会在书籍没有其他任务占用时写入；写入后可在本次会话内撤销。</p>
    </div>
    <template #footer>
      <Button
        label="再检查一下"
        severity="secondary"
        text
        :disabled="state?.stage === 'applying'"
        @click="cancelConfirm()"
      />
      <Button
        :label="state?.reconfirm ? '再次确认应用' : '确认应用'"
        icon="pi pi-check"
        :loading="state?.stage === 'applying'"
        @click="confirmApply()"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.ac {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ac-reconfirm {
  display: flex;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  font-size: 0.8rem;
  line-height: 1.6;
  color: rgb(253, 224, 71);
  background: rgba(234, 179, 8, 0.08);
  border: 1px solid rgba(234, 179, 8, 0.25);
}

.ac-list {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.86rem;
}

.ac-loss {
  color: rgb(253, 186, 116);
}

.ac-note {
  margin: 0;
  font-size: 0.74rem;
  color: rgba(226, 232, 240, 0.55);
}
</style>
