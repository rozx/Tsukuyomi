<script setup lang="ts">
/** 新建工作区的网址输入：提交后建立同步会话；改网址会重建会话。 */
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { injectBookSyncNew } from 'src/composables/book-sync-new/useBookSyncNew';

const { url, error, sync, submit } = injectBookSyncNew();
const { working } = sync;
</script>

<template>
  <form class="suf" @submit.prevent="submit">
    <label class="suf-label" for="book-sync-new-url">小说目录网址</label>
    <div class="suf-row">
      <InputText
        id="book-sync-new-url"
        v-model="url"
        class="suf-input"
        placeholder="https://ncode.syosetu.com/n0000aa/"
        autocomplete="off"
        spellcheck="false"
      />
      <Button type="submit" label="检查" icon="pi pi-search" :disabled="working" />
    </div>
    <p v-if="error" class="suf-error">{{ error }}</p>
    <p v-else class="suf-hint">
      支持小説家になろう、カクヨム、ハーメルン等内置站点；其他网站可交给 AI 导入器处理。
    </p>
  </form>
</template>

<style scoped>
.suf {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.suf-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.8);
}

.suf-row {
  display: flex;
  gap: 0.5rem;
}

.suf-input {
  flex: 1;
  min-width: 0;
}

.suf-hint,
.suf-error {
  margin: 0;
  font-size: 0.74rem;
}

.suf-hint {
  color: rgba(226, 232, 240, 0.5);
}

.suf-error {
  color: rgb(252, 165, 165);
}
</style>
