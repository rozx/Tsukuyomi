<script setup lang="ts">
import { ref } from 'vue';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Dialog from 'primevue/dialog';
import Chips from 'primevue/chips';
import type { Novel, CharacterSetting } from 'src/types/novel';

const props = defineProps<{
  book: Novel | null;
}>();

// TODO: 实现角色设定管理逻辑
// 当前为占位符数据
const characterSettings = ref<Array<{
  id: string;
  name: string;
  description?: string;
  translations: string[];
  aliases: string[];
  occurrences: number;
}>>([]);

const showAddDialog = ref(false);
const showEditDialog = ref(false);
const selectedCharacter = ref<typeof characterSettings.value[0] | null>(null);

// 表单数据
const formData = ref({
  name: '',
  description: '',
  translations: [] as string[],
  aliases: [] as string[],
});

// 打开添加对话框
const openAddDialog = () => {
  formData.value = {
    name: '',
    description: '',
    translations: [],
    aliases: [],
  };
  showAddDialog.value = true;
};

// 打开编辑对话框
const openEditDialog = (character: typeof characterSettings.value[0]) => {
  selectedCharacter.value = character;
  formData.value = {
    name: character.name,
    description: character.description || '',
    translations: [...character.translations],
    aliases: [...character.aliases],
  };
  showEditDialog.value = true;
};

// 关闭对话框
const closeAddDialog = () => {
  showAddDialog.value = false;
  formData.value = {
    name: '',
    description: '',
    translations: [],
    aliases: [],
  };
};

const closeEditDialog = () => {
  showEditDialog.value = false;
  selectedCharacter.value = null;
  formData.value = {
    name: '',
    description: '',
    translations: [],
    aliases: [],
  };
};

// TODO: 实现保存逻辑
const handleSave = () => {
  // 占位符：保存角色设定
  console.log('保存角色设定:', formData.value);
  closeAddDialog();
  closeEditDialog();
};

// TODO: 实现删除逻辑
const handleDelete = (character: typeof characterSettings.value[0]) => {
  // 占位符：删除角色设定
  console.log('删除角色设定:', character.id);
};
</script>

<template>
  <div class="character-setting-panel h-full flex flex-col">
    <!-- 标题区域 -->
    <div class="p-6 border-b border-white/10">
      <h1 class="text-2xl font-semibold text-moon-100 mb-2">角色设置</h1>
      <p class="text-sm text-moon/70">
        管理小说中的角色及其翻译和别名，这些设定会在翻译过程中被优先使用
      </p>
    </div>

    <!-- 内容区域 -->
    <div class="flex-1 p-6 space-y-4 overflow-y-auto">
      <!-- 操作栏 -->
      <div class="flex justify-end">
        <Button
          label="添加角色"
          icon="pi pi-plus"
          class="p-button-primary"
          @click="openAddDialog"
        />
      </div>

      <!-- 角色列表 -->
      <div class="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
        <DataTable
          :value="characterSettings"
          :paginator="true"
          :rows="10"
          :rows-per-page-options="[10, 20, 50]"
          empty-message="暂无角色设定"
          class="character-table"
        >
          <Column field="name" header="角色名称" sortable />
          <Column field="translations" header="翻译">
            <template #body="{ data }">
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="(translation, index) in data.translations"
                  :key="index"
                  class="px-2 py-1 rounded bg-primary/20 text-primary-200 text-xs"
                >
                  {{ translation }}
                </span>
                <span v-if="data.translations.length === 0" class="text-moon/50 text-xs">-</span>
              </div>
            </template>
          </Column>
          <Column field="aliases" header="别名">
            <template #body="{ data }">
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="(alias, index) in data.aliases"
                  :key="index"
                  class="px-2 py-1 rounded bg-accent/20 text-accent-200 text-xs"
                >
                  {{ alias }}
                </span>
                <span v-if="data.aliases.length === 0" class="text-moon/50 text-xs">-</span>
              </div>
            </template>
          </Column>
          <Column field="description" header="描述">
            <template #body="{ data }">
              <span class="text-moon/70">{{ data.description || '-' }}</span>
            </template>
          </Column>
          <Column field="occurrences" header="出现次数" sortable>
            <template #body="{ data }">
              <span class="text-moon/70">{{ data.occurrences }}</span>
            </template>
          </Column>
          <Column header="操作" :exportable="false">
            <template #body="{ data }">
              <div class="flex gap-2">
                <Button
                  icon="pi pi-pencil"
                  class="p-button-text p-button-sm"
                  @click="openEditDialog(data)"
                />
                <Button
                  icon="pi pi-trash"
                  class="p-button-text p-button-sm p-button-danger"
                  @click="handleDelete(data)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </div>

    <!-- 添加角色对话框 -->
    <Dialog
      v-model:visible="showAddDialog"
      header="添加角色"
      :modal="true"
      :style="{ width: '600px' }"
      :closable="true"
      @hide="closeAddDialog"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm text-moon/80">角色名称 *</label>
          <InputText
            v-model="formData.name"
            placeholder="输入角色名称"
            class="w-full"
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm text-moon/80">翻译 *</label>
          <Chips
            v-model="formData.translations"
            placeholder="输入翻译后按回车"
            class="w-full"
          />
          <p class="text-xs text-moon/60">可以添加多个翻译</p>
        </div>

        <div class="space-y-2">
          <label class="text-sm text-moon/80">别名</label>
          <Chips
            v-model="formData.aliases"
            placeholder="输入别名后按回车"
            class="w-full"
          />
          <p class="text-xs text-moon/60">可以添加多个别名</p>
        </div>

        <div class="space-y-2">
          <label class="text-sm text-moon/80">描述</label>
          <Textarea
            v-model="formData.description"
            placeholder="输入描述（可选）"
            :rows="3"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button
          label="取消"
          icon="pi pi-times"
          class="p-button-text"
          @click="closeAddDialog"
        />
        <Button
          label="保存"
          icon="pi pi-check"
          class="p-button-primary"
          @click="handleSave"
        />
      </template>
    </Dialog>

    <!-- 编辑角色对话框 -->
    <Dialog
      v-model:visible="showEditDialog"
      header="编辑角色"
      :modal="true"
      :style="{ width: '600px' }"
      :closable="true"
      @hide="closeEditDialog"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm text-moon/80">角色名称 *</label>
          <InputText
            v-model="formData.name"
            placeholder="输入角色名称"
            class="w-full"
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm text-moon/80">翻译 *</label>
          <Chips
            v-model="formData.translations"
            placeholder="输入翻译后按回车"
            class="w-full"
          />
          <p class="text-xs text-moon/60">可以添加多个翻译</p>
        </div>

        <div class="space-y-2">
          <label class="text-sm text-moon/80">别名</label>
          <Chips
            v-model="formData.aliases"
            placeholder="输入别名后按回车"
            class="w-full"
          />
          <p class="text-xs text-moon/60">可以添加多个别名</p>
        </div>

        <div class="space-y-2">
          <label class="text-sm text-moon/80">描述</label>
          <Textarea
            v-model="formData.description"
            placeholder="输入描述（可选）"
            :rows="3"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button
          label="取消"
          icon="pi pi-times"
          class="p-button-text"
          @click="closeEditDialog"
        />
        <Button
          label="保存"
          icon="pi pi-check"
          class="p-button-primary"
          @click="handleSave"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.character-setting-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.character-table :deep(.p-datatable-header) {
  background: transparent;
  border: none;
  padding: 0;
}

.character-table :deep(.p-datatable-thead > tr > th) {
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.character-table :deep(.p-datatable-tbody > tr) {
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.character-table :deep(.p-datatable-tbody > tr:hover) {
  background: rgba(255, 255, 255, 0.05);
}
</style>

