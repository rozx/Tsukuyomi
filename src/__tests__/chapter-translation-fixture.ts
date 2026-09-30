import { computed, createApp, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ToastService from 'primevue/toastservice';
import { useBooksStore } from '../stores/books';
import { useAIModelsStore } from '../stores/ai-models';
import { useChapterTranslation } from '../composables/book-details/useChapterTranslation';
import type { Chapter, Paragraph } from '../models/novel';

export function translationChapter(id: string, paragraphId: string): Chapter {
  const paragraph: Paragraph = {
    id: paragraphId,
    text: `source ${paragraphId}`,
    translations: [],
    selectedTranslationId: '',
  };
  return { id, title: '', content: [paragraph], createdAt: new Date(0), lastEdited: new Date(0) };
}

/** 使用真实书库与页面状态，仅在任务服务/模型边界替换外部响应。 */
export async function chapterTranslationFixture(chapters: Chapter[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const enabled = { enabled: true, temperature: 0.7 };
  useAIModelsStore().models = [
    {
      id: 'fixture-model',
      name: 'Fixture',
      provider: 'openai',
      model: 'fixture',
      enabled: true,
      apiKey: '',
      baseUrl: '',
      temperature: 0.7,
      maxInputTokens: 10000,
      maxOutputTokens: 1000,
      limitsSource: 'manual',
      lastEdited: new Date(0),
      isDefault: {
        translation: enabled,
        proofreading: enabled,
        termsTranslation: enabled,
        assistant: enabled,
      },
    },
  ];
  const books = useBooksStore();
  await books.addBook({
    id: 'fixture-book',
    title: 'Fixture',
    targetLanguage: 'en-US',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    volumes: [{ id: 'fixture-volume', title: '', chapters }],
  });
  const apps: ReturnType<typeof createApp>[] = [];
  const mount = (chapter: Chapter) => {
    const selected = ref<Chapter | null>(chapter);
    const loaded = ref<Chapter | null>(chapter);
    let service!: ReturnType<typeof useChapterTranslation>;
    const app = createApp({
      setup() {
        service = useChapterTranslation(
          computed(() => books.getBookById('fixture-book')),
          selected,
          loaded,
          computed(() => loaded.value?.content ?? []),
          (volumes) => {
            const fresh = volumes
              ?.flatMap((volume) => volume.chapters ?? [])
              .find((value) => value.id === selected.value?.id);
            if (fresh?.contentLoaded) loaded.value = fresh;
          },
          () => {},
          () => ({ terms: 0, characters: 0 }),
          () => {},
        );
        return () => null;
      },
    });
    app.use(pinia).use(ToastService).mount(document.createElement('div'));
    apps.push(app);
    return { service, selected, loaded };
  };
  return { pinia, books, mount, dispose: () => apps.forEach((app) => app.unmount()) };
}
