<script setup lang="ts">
/**
 * 应用前的确认摘要（挂在 dispatcher 上，只有一份）。数字全部来自比对结果；
 * 书籍在确认后被修改时，会话重算后再次打开并要求重新确认。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { confirm, target, confirmApply, cancelConfirm } = injectBookSync();
const { t } = useI18n();

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
    :header="t(creating ? 'bookUi.sync.confirmCreateTitle' : 'bookUi.sync.confirmApplyTitle')"
    :closable="state?.stage !== 'applying'"
    :style="{ width: '28rem', maxWidth: 'calc(100vw - 2rem)' }"
    @update:visible="onVisible"
  >
    <div v-if="state" class="ac" data-testid="bsw-confirm">
      <div v-if="state.reconfirm" class="ac-reconfirm" role="alert">
        <i class="pi pi-history" aria-hidden="true" />
        {{ t('bookUi.sync.reconfirmNotice') }}
      </div>
      <ul class="ac-list">
        <i18n-t keypath="bookUi.sync.confirmNew" tag="li" :plural="state.summary.newCount">
          <template #count>
            <strong>{{ state.summary.newCount }}</strong>
          </template>
        </i18n-t>
        <i18n-t
          v-if="!creating"
          keypath="bookUi.sync.confirmUpdated"
          tag="li"
          :plural="state.summary.updatedCount"
        >
          <template #count>
            <strong>{{ state.summary.updatedCount }}</strong>
          </template>
        </i18n-t>
        <li v-if="!creating" :class="{ 'ac-loss': state.summary.clearedVersions > 0 }">
          <i18n-t
            v-if="state.summary.clearedVersions"
            keypath="bookUi.sync.confirmClear"
            tag="span"
            :plural="state.summary.clearedVersions"
          >
            <template #count>
              <strong>{{ state.summary.clearedVersions }}</strong>
            </template>
          </i18n-t>
          <template v-else>{{ t('bookUi.sync.confirmNoClear') }}</template>
        </li>
        <li v-for="title in state.summary.newVolumes" :key="title">
          {{ t('bookUi.sync.confirmNewVolume', { title }) }}
        </li>
      </ul>
      <p class="ac-note">{{ t('bookUi.sync.confirmNote') }}</p>
    </div>
    <template #footer>
      <Button
        :label="t('bookUi.sync.reviewAgain')"
        severity="secondary"
        text
        :disabled="state?.stage === 'applying'"
        @click="cancelConfirm()"
      />
      <Button
        :label="t(state?.reconfirm ? 'bookUi.sync.confirmAgain' : 'bookUi.sync.confirm')"
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
