import { onScopeDispose, watch, type Ref } from 'vue';

interface OverlayEntry {
  id: symbol;
  isActive: boolean;
  order: number;
  onClose: () => void;
}

interface UseOverlayCloseStackOptions {
  isOpen: Ref<boolean>;
  onClose: () => void;
  enabled?: Ref<boolean>;
}

const overlayEntries: OverlayEntry[] = [];
let overlayOrder = 0;
let escapeListenerAttached = false;

const overlayEventTarget: (EventTarget & {
  addEventListener: (type: string, listener: (event: KeyboardEvent) => void, options?: boolean) => void;
  removeEventListener: (
    type: string,
    listener: (event: KeyboardEvent) => void,
    options?: boolean,
  ) => void;
}) | null =
  typeof window !== 'undefined'
    ? (window as unknown as EventTarget & {
        addEventListener: (type: string, listener: (event: KeyboardEvent) => void, options?: boolean) => void;
        removeEventListener: (
          type: string,
          listener: (event: KeyboardEvent) => void,
          options?: boolean,
        ) => void;
      })
    : typeof globalThis.addEventListener === 'function' &&
        typeof globalThis.removeEventListener === 'function'
      ? (globalThis as unknown as EventTarget & {
          addEventListener: (
            type: string,
            listener: (event: KeyboardEvent) => void,
            options?: boolean,
          ) => void;
          removeEventListener: (
            type: string,
            listener: (event: KeyboardEvent) => void,
            options?: boolean,
          ) => void;
        })
      : null;

const removeEntryById = (id: symbol) => {
  const index = overlayEntries.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    overlayEntries.splice(index, 1);
  }
};

const getTopOverlay = (): OverlayEntry | null => {
  let current: OverlayEntry | null = null;

  for (const entry of overlayEntries) {
    if (!entry.isActive) {
      continue;
    }

    if (!current || entry.order > current.order) {
      current = entry;
    }
  }

  return current;
};

const handleEscapeKey = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') {
    return;
  }

  const topOverlay = getTopOverlay();
  if (!topOverlay) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  topOverlay.onClose();
};

const ensureEscapeListener = () => {
  if (!overlayEventTarget || escapeListenerAttached) {
    return;
  }

  overlayEventTarget.addEventListener('keydown', handleEscapeKey, true);
  escapeListenerAttached = true;
};

const cleanupEscapeListener = () => {
  if (!overlayEventTarget || !escapeListenerAttached || overlayEntries.length > 0) {
    return;
  }

  overlayEventTarget.removeEventListener('keydown', handleEscapeKey, true);
  escapeListenerAttached = false;
};

const upsertEntry = (id: symbol, onClose: () => void): OverlayEntry => {
  const current = overlayEntries.find((entry) => entry.id === id);
  if (current) {
    current.onClose = onClose;
    return current;
  }

  const created: OverlayEntry = {
    id,
    isActive: false,
    order: 0,
    onClose,
  };
  overlayEntries.push(created);
  ensureEscapeListener();
  return created;
};

export function useOverlayCloseStack(options: UseOverlayCloseStackOptions) {
  const id = Symbol('overlay-close-stack-entry');

  const updateEntryState = () => {
    const enabled = options.enabled?.value ?? true;
    const open = options.isOpen.value;
    const entry = upsertEntry(id, options.onClose);

    if (enabled && open) {
      if (!entry.isActive) {
        entry.isActive = true;
        entry.order = ++overlayOrder;
      }
      return;
    }

    entry.isActive = false;
  };

  watch(
    () => [options.isOpen.value, options.enabled?.value ?? true, options.onClose] as const,
    () => {
      updateEntryState();
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    removeEntryById(id);
    cleanupEscapeListener();
  });
}
