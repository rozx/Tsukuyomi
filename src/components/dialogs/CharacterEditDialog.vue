<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import SelectButton from 'primevue/selectbutton';
import TranslatableInput from 'src/components/translation/TranslatableInput.vue';
import AppMessage from 'src/components/common/AppMessage.vue';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import type { EntityDialogProps, EntityDialogEmits, EntityNameForm } from './entity-dialog-types';
import { getNameTranslation } from 'src/services/localization/selection';
import { useLanguageEditGuard } from 'src/composables/translation/useLanguageEditGuard';
import type { CharacterSetting, Alias } from 'src/models/novel';

const { t } = useI18n();

interface CharacterForm extends EntityNameForm {
  sex?: 'male' | 'female' | 'other' | undefined;
  speakingStyle: string;
  aliases: Array<{ id?: string; name: string; translation: string }>;
}
const props = defineProps<EntityDialogProps & { character?: CharacterSetting | null }>();
const emit = defineEmits<EntityDialogEmits<CharacterForm>>();

const { languageChanged, languageChangedMessage, captureLanguage } = useLanguageEditGuard(
  () => props.targetLanguage ?? 'zh-CN',
);

// 表单数据
const formData = ref({
  name: '',
  sex: undefined as 'male' | 'female' | 'other' | undefined,
  description: '',
  speakingStyle: '',
  translation: '',
  aliases: [] as Array<{ id?: string; name: string; translation: string }>,
});

const sexOptions = computed(() => [
  { label: t('entityUi.unknown'), value: undefined },
  { label: t('entityUi.male'), value: 'male' },
  { label: t('entityUi.female'), value: 'female' },
  { label: t('entityUi.other'), value: 'other' },
]);

// 表单禁用状态（加载中时禁用所有输入控件）
const isFormDisabled = computed(() => !!props.loading);

// 监听 visible 和 character 变化以重置/初始化表单
watch(
  [() => props.visible, () => props.character],
  ([visible, character], previous) => {
    if (visible) {
      if (previous?.[0] !== true) captureLanguage();
      else if (languageChanged.value) return;
      if (character) {
        // 编辑模式：使用传入的角色数据
        formData.value = {
          name: character.name,
          sex: character.sex,
          description: character.description || '',
          speakingStyle: character.speakingStyle || '',
          translation:
            getNameTranslation(character, props.targetLanguage ?? 'zh-CN')?.translation ?? '',
          aliases: character.aliases.map((a: Alias) => ({
            ...(a.id ? { id: a.id } : {}),
            name: a.name,
            translation: getNameTranslation(a, props.targetLanguage ?? 'zh-CN')?.translation ?? '',
          })),
        };
      } else {
        // 添加模式：重置表单
        formData.value = {
          name: '',
          sex: undefined,
          description: '',
          speakingStyle: '',
          translation: '',
          aliases: [],
        };
      }
    }
  },
  { immediate: true },
);

const handleSave = () => {
  if (languageChanged.value) return;
  emit('save', {
    name: formData.value.name,
    sex: formData.value.sex,
    description: formData.value.description,
    speakingStyle: formData.value.speakingStyle,
    translation: formData.value.translation,
    aliases: formData.value.aliases,
  });
};

const handleClose = () => {
  emit('update:visible', false);
};

// 添加别名
const addAlias = () => {
  formData.value.aliases.push({ name: '', translation: '' });
};

// 删除别名
const removeAlias = (index: number) => {
  formData.value.aliases.splice(index, 1);
};
</script>

<template>
  <AdaptiveDialog
    :visible="visible"
    :header="character ? t('entityUi.editCharacter') : t('entityUi.addCharacter')"
    desktop-width="700px"
    :eyebrow="t('entityUi.character')"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <AppMessage
        v-if="languageChanged"
        severity="warn"
        :message="languageChangedMessage"
        :closable="false"
      />
      <div class="space-y-2">
        <label class="text-sm text-moon-100/80">{{ t('entityUi.characterName') }}</label>
        <TranslatableInput
          v-model="formData.name"
          :placeholder="t('entityUi.characterPlaceholder')"
          type="input"
          :apply-translation-to-input="false"
          :disabled="isFormDisabled"
          @translation-applied="
            (translation) => {
              formData.translation = translation;
            }
          "
        />
        <p class="text-xs text-moon-100/60">{{ t('entityUi.nameTranslationHint') }}</p>
      </div>

      <div class="space-y-2">
        <label class="text-sm text-moon-100/80">{{ t('entityUi.sex') }}</label>
        <SelectButton
          v-model="formData.sex"
          :options="sexOptions"
          optionLabel="label"
          optionValue="value"
          class="w-full"
          :disabled="isFormDisabled"
        />
      </div>

      <div class="space-y-2">
        <label class="text-sm text-moon-100/80">{{ t('entityUi.translation') }}</label>
        <InputText
          v-model="formData.translation"
          :placeholder="t('entityUi.translationPlaceholder')"
          class="w-full"
          :disabled="isFormDisabled"
        />
        <AppMessage severity="info" :message="t('entityUi.translationAiHint')" :closable="false" />
      </div>

      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <label class="text-sm text-moon-100/80">{{ t('entityUi.aliases') }}</label>
          <Button
            icon="pi pi-plus"
            :label="t('entityUi.addAlias')"
            class="p-button-text p-button-sm"
            size="small"
            @click="addAlias"
            :disabled="isFormDisabled"
          />
        </div>
        <div v-if="formData.aliases.length === 0" class="text-xs text-moon-100/50 italic py-2 mb-2">
          {{ t('entityUi.noAliases') }}
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="(alias, index) in formData.aliases"
            :key="alias.id ?? index"
            class="flex gap-2 items-center p-3 bg-white/5 rounded border border-white/10"
          >
            <div class="flex-1 space-y-2">
              <p v-if="alias.id" class="text-xs text-moon-100/50 break-all">ID: {{ alias.id }}</p>
              <div>
                <label class="text-xs text-moon-100/60 block mb-1">{{
                  t('entityUi.aliasName')
                }}</label>
                <TranslatableInput
                  v-model="alias.name"
                  :placeholder="t('entityUi.aliasPlaceholder')"
                  type="input"
                  :apply-translation-to-input="false"
                  :disabled="isFormDisabled"
                  @translation-applied="
                    (translation) => {
                      alias.translation = translation;
                    }
                  "
                />
                <p class="text-xs text-moon-100/50 mt-1">
                  {{ t('entityUi.aliasTranslationHint') }}
                </p>
              </div>
              <div>
                <label class="text-xs text-moon-100/60 block mb-1">{{
                  t('entityUi.aliasTranslation')
                }}</label>
                <InputText
                  v-model="alias.translation"
                  :placeholder="t('entityUi.aliasTranslationPlaceholder')"
                  class="w-full"
                  :disabled="isFormDisabled"
                />
              </div>
            </div>
            <Button
              icon="pi pi-trash"
              class="p-button-text p-button-danger p-button-sm"
              size="small"
              @click="removeAlias(index)"
              :disabled="isFormDisabled"
            />
          </div>
        </div>
        <AppMessage severity="info" :message="t('entityUi.aliasAiHint')" :closable="false" />
      </div>

      <div class="space-y-2">
        <label class="text-sm text-moon-100/80">{{ t('entityUi.description') }}</label>
        <Textarea
          v-model="formData.description"
          :placeholder="t('entityUi.descriptionPlaceholder')"
          :rows="3"
          class="w-full"
          :disabled="isFormDisabled"
        />
        <AppMessage severity="info" :message="t('entityUi.descriptionAiHint')" :closable="false" />
      </div>

      <div class="space-y-2">
        <label class="text-sm text-moon-100/80">{{ t('entityUi.speakingStyle') }}</label>
        <Textarea
          v-model="formData.speakingStyle"
          :placeholder="t('entityUi.speakingStylePlaceholder')"
          :rows="2"
          class="w-full"
          :disabled="isFormDisabled"
        />
        <AppMessage severity="info" :message="t('entityUi.speakingStyleHint')" :closable="false" />
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2 mt-6">
        <Button
          :label="t('entityUi.cancel')"
          icon="pi pi-times"
          class="p-button-text"
          @click="handleClose"
          :disabled="loading"
        />
        <Button
          :label="t('entityUi.save')"
          icon="pi pi-check"
          class="p-button-primary"
          @click="handleSave"
          :loading="loading"
        />
      </div>
    </template>
  </AdaptiveDialog>
</template>
