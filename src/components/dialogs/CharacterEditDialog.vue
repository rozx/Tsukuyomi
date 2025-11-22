<script setup lang="ts">
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Dialog from 'primevue/dialog';
import SelectButton from 'primevue/selectbutton';
import TranslatableInput from 'src/components/translation/TranslatableInput.vue';
import AppMessage from 'src/components/common/AppMessage.vue';
import type { CharacterSetting, Alias } from 'src/types/novel';

const props = defineProps<{
  visible: boolean;
  character?: CharacterSetting | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (
    e: 'save',
    data: {
      name: string;
      sex?: 'male' | 'female' | 'other' | undefined;
      translation: string;
      description: string;
      speakingStyle: string;
      aliases: Array<{ name: string; translation: string }>;
    },
  ): void;
}>();

// 表单数据
const formData = ref({
  name: '',
  sex: undefined as 'male' | 'female' | 'other' | undefined,
  description: '',
  speakingStyle: '',
  translation: '',
  aliases: [] as Array<{ name: string; translation: string }>,
});

const sexOptions = [
  { label: '未知', value: undefined },
  { label: '男性', value: 'male' },
  { label: '女性', value: 'female' },
  { label: '其他', value: 'other' },
];

// 监听 visible 和 character 变化以重置/初始化表单
watch(
  [() => props.visible, () => props.character],
  ([visible, character]) => {
    if (visible) {
      if (character) {
        // 编辑模式：使用传入的角色数据
        formData.value = {
          name: character.name,
          sex: character.sex,
          description: character.description || '',
          speakingStyle: character.speakingStyle || '',
          translation: character.translation.translation,
          aliases: character.aliases.map((a: Alias) => ({
            name: a.name,
            translation: a.translation.translation,
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
  <Dialog
    :visible="visible"
    :header="character ? '编辑角色' : '添加角色'"
    :modal="true"
    :style="{ width: '700px' }"
    :closable="true"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <label class="text-sm text-moon-100/80">角色名称 *</label>
        <TranslatableInput
          v-model="formData.name"
          placeholder="输入角色名称"
          type="input"
          :apply-translation-to-input="false"
          :disabled="loading || false"
          @translation-applied="
            (translation) => {
              formData.translation = translation;
            }
          "
        />
        <p class="text-xs text-moon-100/60">点击翻译图标可翻译名称，翻译结果将填入翻译字段</p>
      </div>

      <div class="space-y-2">
        <label class="text-sm text-moon-100/80">性别</label>
        <SelectButton
          v-model="formData.sex"
          :options="sexOptions"
          optionLabel="label"
          optionValue="value"
          class="w-full"
          :disabled="loading || false"
        />
      </div>

      <div class="space-y-2">
        <label class="text-sm text-moon-100/80">翻译</label>
        <InputText
          v-model="formData.translation"
          placeholder="输入翻译"
          class="w-full"
          :disabled="loading || false"
        />
        <AppMessage
          severity="info"
          message="留空则让翻译 AI 在翻译章节时自动添加、更新或删除翻译内容"
          :closable="false"
        />
      </div>

      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <label class="text-sm text-moon-100/80">别名</label>
          <Button
            icon="pi pi-plus"
            label="添加别名"
            class="p-button-text p-button-sm"
            size="small"
            @click="addAlias"
            :disabled="loading || false"
          />
        </div>
        <div v-if="formData.aliases.length === 0" class="text-xs text-moon-100/50 italic py-2 mb-2">
          暂无别名，点击"添加别名"按钮添加
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="(alias, index) in formData.aliases"
            :key="index"
            class="flex gap-2 items-center p-3 bg-white/5 rounded border border-white/10"
          >
            <div class="flex-1 space-y-2">
              <div>
                <label class="text-xs text-moon-100/60 block mb-1">别名名称</label>
                <TranslatableInput
                  v-model="alias.name"
                  placeholder="输入别名名称"
                  type="input"
                  :apply-translation-to-input="false"
                  :disabled="loading || false"
                  @translation-applied="
                    (translation) => {
                      alias.translation = translation;
                    }
                  "
                />
                <p class="text-xs text-moon-100/50 mt-1">
                  点击翻译图标可翻译别名，翻译结果将填入别名翻译字段
                </p>
              </div>
              <div>
                <label class="text-xs text-moon-100/60 block mb-1">别名翻译</label>
                <InputText
                  v-model="alias.translation"
                  placeholder="输入别名翻译"
                  class="w-full"
                  :disabled="loading || false"
                />
              </div>
            </div>
            <Button
              icon="pi pi-trash"
              class="p-button-text p-button-danger p-button-sm"
              size="small"
              @click="removeAlias(index)"
              :disabled="loading || false"
            />
          </div>
        </div>
        <AppMessage
          severity="info"
          message="别名翻译留空时，AI 在翻译章节时会自动添加、更新或删除别名及其翻译"
          :closable="false"
        />
      </div>

      <div class="space-y-2">
        <label class="text-sm text-moon-100/80">描述</label>
        <Textarea
          v-model="formData.description"
          placeholder="输入描述（可选）"
          :rows="3"
          class="w-full"
          :disabled="loading || false"
        />
        <AppMessage
          severity="info"
          message="留空则让翻译 AI 在翻译章节时自动添加、更新或删除描述内容"
          :closable="false"
        />
      </div>

      <div class="space-y-2">
        <label class="text-sm text-moon-100/80">说话口吻</label>
        <Textarea
          v-model="formData.speakingStyle"
          placeholder="输入说话口吻（可选）。例如：傲娇、古风、口癖(desu/nya)等"
          :rows="2"
          class="w-full"
          :disabled="loading || false"
        />
        <AppMessage
          severity="info"
          message="说话口吻有助于 AI 在翻译对话时保持角色个性一致"
          :closable="false"
        />
      </div>
    </div>

    <template #footer>
      <Button
        label="取消"
        icon="pi pi-times"
        class="p-button-text"
        @click="handleClose"
        :disabled="loading"
      />
      <Button
        label="保存"
        icon="pi pi-check"
        class="p-button-primary"
        @click="handleSave"
        :loading="loading"
      />
    </template>
  </Dialog>
</template>
