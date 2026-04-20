import { computed, ref, type Ref } from 'vue';
import type Popover from 'primevue/popover';

/**
 * CharacterPopover / TermPopover 共享的脚本逻辑：Popover 引用 + 计数 +
 * edit/delete/create emit 三件套 + toggle/hide 公开方法。
 */
export function useEntityListPopover<T>(
  items: Ref<T[]>,
  emit: {
    (event: 'edit', item: T): void;
    (event: 'delete', item: T): void;
    (event: 'create'): void;
  },
) {
  const popover = ref<InstanceType<typeof Popover> | null>(null);
  const count = computed(() => items.value.length);

  const handleEdit = (item: T) => emit('edit', item);
  const handleDelete = (item: T) => emit('delete', item);
  const handleCreate = () => emit('create');

  const toggle = (event: Event) => {
    popover.value?.toggle(event);
  };
  const hide = () => {
    popover.value?.hide();
  };

  return {
    popover,
    count,
    handleEdit,
    handleDelete,
    handleCreate,
    toggle,
    hide,
  };
}
