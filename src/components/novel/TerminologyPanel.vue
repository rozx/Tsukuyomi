<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Dialog from 'primevue/dialog';
import type { Novel, Terminology } from 'src/types/novel';
import ExtractedTermsDialog from './ExtractedTermsDialog.vue';

const props = defineProps<{
  book: Novel | null;
}>();

// TODO: 实现术语管理逻辑
// 当前为占位符数据
const terminologies = ref<
  Array<{
    id: string;
    name: string;
    description?: string;
    translation: string;
    occurrences: number;
  }>
>([]);

const showAddDialog = ref(false);
const showEditDialog = ref(false);
const showExtractedTermsDialog = ref(false);
const selectedTerminology = ref<(typeof terminologies.value)[0] | null>(null);

// 表单数据
const formData = ref({
  name: '',
  description: '',
  translation: '',
});

// 打开添加对话框
const openAddDialog = () => {
  formData.value = {
    name: '',
    description: '',
    translation: '',
  };
  showAddDialog.value = true;
};

// 打开编辑对话框
const openEditDialog = (terminology: (typeof terminologies.value)[0]) => {
  selectedTerminology.value = terminology;
  formData.value = {
    name: terminology.name,
    description: terminology.description || '',
    translation: terminology.translation,
  };
  showEditDialog.value = true;
};

// 关闭对话框
const closeAddDialog = () => {
  showAddDialog.value = false;
  formData.value = {
    name: '',
    description: '',
    translation: '',
  };
};

const closeEditDialog = () => {
  showEditDialog.value = false;
  selectedTerminology.value = null;
  formData.value = {
    name: '',
    description: '',
    translation: '',
  };
};

// TODO: 实现保存逻辑
const handleSave = () => {
  // 占位符：保存术语
  console.log('保存术语:', formData.value);
  closeAddDialog();
  closeEditDialog();
};

// TODO: 实现删除逻辑
const handleDelete = (terminology: (typeof terminologies.value)[0]) => {
  // 占位符：删除术语
  console.log('删除术语:', terminology.id);
};

// 打开提取术语对话框
const handleExtractTerms = () => {
  if (!props.book) {
    console.warn('没有选择书籍');
    return;
  }
  showExtractedTermsDialog.value = true;
};
</script>

<template>
  <div class="terminology-panel h-full flex flex-col">
    <!-- 标题区域 -->
    <div class="p-6 border-b border-white/10">
      <h1 class="text-2xl font-semibold text-moon-100 mb-2">术语设置</h1>
      <p class="text-sm text-moon/70">管理小说中的术语及其翻译，这些术语会在翻译过程中被优先使用</p>
    </div>

    <!-- 内容区域 -->
    <div class="flex-1 flex flex-col min-h-0 p-6">
      <!-- 操作栏 -->
      <div class="flex-shrink-0 flex justify-end gap-2 mb-4">
        <Button
          label="提取术语"
          icon="pi pi-search"
          class="p-button-outlined"
          @click="handleExtractTerms"
        />
        <Button
          label="添加术语"
          icon="pi pi-plus"
          class="p-button-primary"
          @click="openAddDialog"
        />
      </div>

      <!-- 术语列表 -->
      <div class="flex-1 flex flex-col min-h-0 rounded-lg border border-white/10 bg-white/5">
        <DataView
          :value="terminologies"
          data-key="id"
          layout="grid"
          :rows="12"
          :paginator="terminologies.length > 0"
          :rows-per-page-options="[12, 24, 48, 96]"
          paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
          class="flex-1 flex flex-col min-h-0"
        >
          <template #empty>
            <div class="text-center py-12">
              <i class="pi pi-book text-4xl text-moon/50 mb-4" />
              <p class="text-moon/70">暂无术语</p>
              <Button
                label="添加第一个术语"
                icon="pi pi-plus"
                class="p-button-primary mt-4"
                @click="openAddDialog"
              />
            </div>
          </template>

          <template #grid="slotProps">
            <div
              class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4"
            >
              <div
                v-for="terminology in slotProps.items"
                :key="terminology.id"
                class="terminology-card rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors flex flex-col"
              >
                <!-- 术语名称 -->
                <div class="mb-2">
                  <h4
                    class="text-sm font-semibold text-moon/90 line-clamp-1"
                    :title="terminology.name"
                  >
                    {{ terminology.name }}
                  </h4>
                </div>

                <!-- 翻译 -->
                <div class="mb-2">
                  <p class="text-xs text-moon/60 mb-1">翻译</p>
                  <p class="text-sm text-primary line-clamp-2" :title="terminology.translation">
                    {{ terminology.translation }}
                  </p>
                </div>

                <!-- 描述 -->
                <div v-if="terminology.description" class="mb-2 flex-1">
                  <p class="text-xs text-moon/60 mb-1">描述</p>
                  <p class="text-xs text-moon/70 line-clamp-3" :title="terminology.description">
                    {{ terminology.description }}
                  </p>
                </div>

                <!-- 出现次数 -->
                <div class="mb-3 pt-2 border-t border-white/5">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-moon/60">出现次数</span>
                    <span class="text-moon/80 font-medium">{{ terminology.occurrences }}</span>
                  </div>
                </div>

                <!-- 操作按钮 -->
                <div class="flex gap-2 mt-auto">
                  <Button
                    icon="pi pi-pencil"
                    class="p-button-text p-button-sm flex-1"
                    @click="openEditDialog(terminology)"
                  />
                  <Button
                    icon="pi pi-trash"
                    class="p-button-text p-button-sm p-button-danger flex-1"
                    @click="handleDelete(terminology)"
                  />
                </div>
              </div>
            </div>
          </template>
        </DataView>
      </div>
    </div>

    <!-- 添加术语对话框 -->
    <Dialog
      v-model:visible="showAddDialog"
      header="添加术语"
      :modal="true"
      :style="{ width: '600px' }"
      :closable="true"
      @hide="closeAddDialog"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm text-moon/80">术语名称 *</label>
          <InputText v-model="formData.name" placeholder="输入术语名称" class="w-full" />
        </div>

        <div class="space-y-2">
          <label class="text-sm text-moon/80">翻译 *</label>
          <InputText v-model="formData.translation" placeholder="输入翻译" class="w-full" />
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
        <Button label="取消" icon="pi pi-times" class="p-button-text" @click="closeAddDialog" />
        <Button label="保存" icon="pi pi-check" class="p-button-primary" @click="handleSave" />
      </template>
    </Dialog>

    <!-- 编辑术语对话框 -->
    <Dialog
      v-model:visible="showEditDialog"
      header="编辑术语"
      :modal="true"
      :style="{ width: '600px' }"
      :closable="true"
      @hide="closeEditDialog"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm text-moon/80">术语名称 *</label>
          <InputText v-model="formData.name" placeholder="输入术语名称" class="w-full" />
        </div>

        <div class="space-y-2">
          <label class="text-sm text-moon/80">翻译 *</label>
          <InputText v-model="formData.translation" placeholder="输入翻译" class="w-full" />
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
        <Button label="取消" icon="pi pi-times" class="p-button-text" @click="closeEditDialog" />
        <Button label="保存" icon="pi pi-check" class="p-button-primary" @click="handleSave" />
      </template>
    </Dialog>

    <!-- 提取的术语对话框 -->
    <ExtractedTermsDialog v-model:visible="showExtractedTermsDialog" :book="book" />
  </div>
</template>

<style scoped>
.terminology-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.terminology-card {
  min-height: 180px;
}

.extracted-term-card {
  min-height: 160px;
}
</style>
