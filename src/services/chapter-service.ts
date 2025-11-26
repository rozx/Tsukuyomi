import type { Novel, Volume, Chapter, Paragraph, Translation } from 'src/models/novel';
import { UniqueIdGenerator, extractIds, generateShortId } from 'src/utils/id-generator';
import { getChapterContentText, getChapterDisplayTitle } from 'src/utils/novel-utils';
import { ChapterContentService } from './chapter-content-service';

/**
 * 段落搜索结果接口
 */
export interface ParagraphSearchResult {
  paragraph: Paragraph;
  paragraphIndex: number;
  chapter: Chapter;
  chapterIndex: number;
  volume: Volume;
  volumeIndex: number;
}

/**
 * 获取段落的翻译文本
 * @param paragraph 段落对象
 * @returns 翻译文本，如果没有则返回空字符串
 */
function getParagraphTranslationText(paragraph: Paragraph): string {
  if (!paragraph.selectedTranslationId || !paragraph.translations) {
    return '';
  }
  const selectedTranslation = paragraph.translations.find(
    (t) => t.id === paragraph.selectedTranslationId,
  );
  return selectedTranslation?.translation || '';
}

/**
 * 章节服务
 * 提供章节获取、更新、合并等通用功能
 */
export class ChapterService {
  /**
   * 通过 URL 查找章节
   * @param novel 小说对象
   * @param chapterUrl 章节 URL
   * @returns 找到的章节，如果不存在则返回 null
   */
  static findChapterByUrl(novel: Novel | null | undefined, chapterUrl: string): Chapter | null {
    if (!novel || !novel.volumes || !chapterUrl) {
      return null;
    }

    for (const volume of novel.volumes) {
      if (volume.chapters) {
        for (const chapter of volume.chapters) {
          if (chapter.webUrl === chapterUrl) {
            return chapter;
          }
        }
      }
    }

    return null;
  }

  /**
   * 检查章节是否已存在于小说中
   * @param novel 小说对象
   * @param chapter 要检查的章节
   * @returns 章节是否已存在
   */
  static isChapterImported(novel: Novel | null | undefined, chapter: Chapter): boolean {
    if (!chapter.webUrl) {
      return false;
    }
    return ChapterService.findChapterByUrl(novel, chapter.webUrl) !== null;
  }

  /**
   * 比较两个日期，返回远程是否比本地更新
   * @param remoteDate 远程日期
   * @param localDate 本地日期
   * @returns 远程是否更新
   */
  static isRemoteNewer(
    remoteDate: Date | string | undefined,
    localDate: Date | string | undefined,
  ): boolean {
    if (!remoteDate) return false;
    if (!localDate) return true; // 如果本地没有日期，认为远程更新

    const remote = remoteDate instanceof Date ? remoteDate : new Date(remoteDate);
    const local = localDate instanceof Date ? localDate : new Date(localDate);

    // 检查日期是否有效
    if (isNaN(remote.getTime()) || isNaN(local.getTime())) {
      return false;
    }

    // 比较时间戳，远程更新则返回 true
    return remote.getTime() > local.getTime();
  }

  /**
   * 检查章节是否需要更新（已导入但远程更新）
   * @param novel 小说对象
   * @param chapter 远程章节
   * @returns 是否需要更新
   */
  static shouldUpdateChapter(novel: Novel | null | undefined, chapter: Chapter): boolean {
    if (!ChapterService.isChapterImported(novel, chapter)) {
      return false; // 未导入的章节由其他逻辑处理
    }

    const importedChapter = ChapterService.findChapterByUrl(novel, chapter.webUrl || '');
    if (!importedChapter) {
      return false;
    }

    // 比较远程和本地的 lastUpdated
    return ChapterService.isRemoteNewer(chapter.lastUpdated, importedChapter.lastUpdated);
  }

  /**
   * 合并章节到现有章节数组
   * @param existingChapters 现有章节数组
   * @param newChapters 新章节数组
   * @param updateStrategy 更新策略：'replace' 替换整个章节，'merge' 合并章节属性（默认）
   * @returns 合并后的章节数组
   */
  static mergeChapters(
    existingChapters: Chapter[],
    newChapters: Chapter[],
    updateStrategy: 'replace' | 'merge' = 'merge',
  ): Chapter[] {
    const mergedChapters = [...existingChapters];

    newChapters.forEach((newChapter) => {
      if (newChapter.webUrl) {
        // 查找同 URL 的现有章节
        const existingChapterIndex = mergedChapters.findIndex(
          (ch) => ch.webUrl === newChapter.webUrl,
        );

        if (existingChapterIndex >= 0) {
          // 章节已存在，更新内容
          const existingChapter = mergedChapters[existingChapterIndex];
          if (existingChapter) {
            // 保留 lastUpdated：如果新章节有 lastUpdated 则使用新的，否则保留原有的
            const lastUpdated = newChapter.lastUpdated ?? existingChapter.lastUpdated;

            if (updateStrategy === 'replace') {
              // 替换整个章节
              const updatedChapter: Chapter = {
                ...newChapter,
                id: existingChapter.id, // 保留原有 ID
                createdAt: existingChapter.createdAt, // 保留原有的创建时间
                lastEdited: new Date(), // 内容更新，更新时间
              };
              if (lastUpdated !== undefined) {
                updatedChapter.lastUpdated = lastUpdated;
              }
              mergedChapters[existingChapterIndex] = updatedChapter;
            } else {
              // 合并章节属性
              // 重要：保留现有章节的 content，如果新章节没有 content 或 content 为空
              const preserveContent =
                existingChapter.content !== undefined &&
                existingChapter.content !== null &&
                (newChapter.content === undefined ||
                  newChapter.content === null ||
                  (Array.isArray(newChapter.content) && newChapter.content.length === 0));

              const updatedChapter: Chapter = {
                ...existingChapter,
                ...newChapter,
                id: existingChapter.id, // 保留原有 ID
                createdAt: existingChapter.createdAt, // 保留原有的创建时间
                lastEdited: new Date(), // 内容更新，更新时间
                // 如果新章节没有内容，保留原有内容
                ...(preserveContent ? { content: existingChapter.content } : {}),
              };
              if (lastUpdated !== undefined) {
                updatedChapter.lastUpdated = lastUpdated;
              }
              mergedChapters[existingChapterIndex] = updatedChapter;
            }
          }
        } else {
          // 章节不存在，添加新章节（保留 newChapter 的 lastEdited，应该等于 createdAt）
          mergedChapters.push(newChapter);
        }
      } else {
        // 没有 URL 的章节，直接添加
        mergedChapters.push(newChapter);
      }
    });

    return mergedChapters;
  }

  /**
   * 合并卷和章节到现有小说
   * @param existingNovel 现有小说数据（可以是部分数据）
   * @param newNovel 新获取的小说数据
   * @param options 合并选项
   * @returns 合并后的小说数据
   * @note 在合并卷时，通过比较 title.original（原始标题）来匹配现有卷，
   *       确保即使卷标题被翻译了，也能正确匹配到相同的卷
   */
  static mergeNovelData(
    existingNovel: Partial<Novel>,
    newNovel: Novel,
    options: {
      updateTitle?: boolean; // 是否更新标题（如果现有标题为空则总是更新）
      updateAuthor?: boolean; // 是否更新作者
      updateDescription?: boolean; // 是否更新描述
      updateTags?: boolean; // 是否更新标签
      updateWebUrl?: boolean; // 是否更新 URL
      chapterUpdateStrategy?: 'replace' | 'merge'; // 章节更新策略
    } = {},
  ): Partial<Novel> {
    const {
      updateTitle = true,
      updateAuthor = true,
      updateDescription = true,
      updateTags = true,
      updateWebUrl = true,
      chapterUpdateStrategy = 'merge',
    } = options;

    const merged: Partial<Novel> = { ...existingNovel };

    // 更新标题（只有当现有标题为空时才覆盖）
    if (updateTitle && newNovel.title) {
      if (!merged.title?.trim()) {
        merged.title = newNovel.title;
      }
    }

    // 更新作者
    if (updateAuthor && newNovel.author) {
      merged.author = newNovel.author;
    }

    // 更新描述
    if (updateDescription && newNovel.description) {
      merged.description = newNovel.description;
    }

    // 合并标签
    if (updateTags && newNovel.tags && newNovel.tags.length > 0) {
      const existingTags = merged.tags || [];
      merged.tags = [
        ...existingTags,
        ...newNovel.tags.filter((tag) => !existingTags.includes(tag)),
      ];
    }

    // 合并 URL
    if (updateWebUrl && newNovel.webUrl && newNovel.webUrl.length > 0) {
      const existingUrls = merged.webUrl || [];
      merged.webUrl = [
        ...existingUrls,
        ...newNovel.webUrl.filter((url) => !existingUrls.includes(url)),
      ];
    }

    // 合并 volumes 和 chapters
    if (newNovel.volumes && newNovel.volumes.length > 0) {
      const existingVolumes = merged.volumes || [];

      if (existingVolumes.length === 0) {
        // 如果没有现有卷，直接使用新的
        merged.volumes = newNovel.volumes;
      } else {
        // 合并卷和章节
        const mergedVolumes: Volume[] = [...existingVolumes];

        newNovel.volumes.forEach((newVolume) => {
          // 查找同标题的现有卷（比较原文标题）
          // 兼容旧数据格式：如果 title 是字符串，直接比较字符串；否则比较 original
          const newVolumeOriginalTitle =
            typeof newVolume.title === 'string' ? newVolume.title : newVolume.title.original;
          const existingVolumeIndex = mergedVolumes.findIndex((v) => {
            if (typeof v.title === 'string') {
              return v.title === newVolumeOriginalTitle;
            }
            return v.title.original === newVolumeOriginalTitle;
          });

          if (existingVolumeIndex >= 0) {
            // 卷已存在，合并章节
            const existingVolume = mergedVolumes[existingVolumeIndex];
            const existingChapters = existingVolume?.chapters || [];
            const newChapters = newVolume.chapters || [];

            if (existingChapters.length === 0) {
              // 如果现有卷没有章节，直接使用新章节
              if (existingVolume) {
                existingVolume.chapters = newChapters;
              }
            } else {
              // 合并章节
              if (existingVolume) {
                existingVolume.chapters = ChapterService.mergeChapters(
                  existingChapters,
                  newChapters,
                  chapterUpdateStrategy,
                );
              }
            }
          } else {
            // 卷不存在，添加新卷
            mergedVolumes.push(newVolume);
          }
        });

        merged.volumes = mergedVolumes;
      }
    }

    return merged;
  }

  /**
   * 将章节内容文本转换为段落数组
   * @param content 章节内容文本
   * @returns 段落数组
   */
  static convertContentToParagraphs(content: string): Paragraph[] {
    const idGenerator = new UniqueIdGenerator();
    return content.split('\n').map((text) => {
      const paragraph: Paragraph = {
        id: idGenerator.generate(),
        text: text, // 不使用 trim()，保留原始格式（包括开头空格和空行）
        selectedTranslationId: '',
        translations: [],
      };
      return paragraph;
    });
  }

  /**
   * 获取章节的内容文本
   * @param chapter 章节对象
   * @returns 章节内容文本，如果没有内容则返回空字符串
   */
  static getChapterContentText(chapter: Chapter): string {
    return getChapterContentText(chapter);
  }

  /**
   * 获取章节的导入状态信息
   * @param novel 小说对象
   * @param chapter 章节对象
   * @returns 导入状态信息，如果未导入则返回 null
   */
  static getChapterImportStatus(
    novel: Novel | null | undefined,
    chapter: Chapter,
  ): { text: string; class: string } | null {
    if (!ChapterService.isChapterImported(novel, chapter)) {
      return null;
    }

    const isNewer = ChapterService.shouldUpdateChapter(novel, chapter);
    if (isNewer) {
      return {
        text: '已导入（有更新）',
        class: 'px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded flex-shrink-0',
      };
    } else {
      return {
        text: '已导入',
        class: 'px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded flex-shrink-0',
      };
    }
  }

  // --- CRUD 操作 ---

  /**
   * 添加新卷
   * @param novel 小说对象
   * @param title 卷标题
   * @returns 更新后的卷列表
   */
  static addVolume(novel: Novel, title: string): Volume[] {
    const existingVolumes = novel.volumes || [];
    const volumeIds = extractIds(existingVolumes);
    const idGenerator = new UniqueIdGenerator(volumeIds);

    const trimmedTitle = title.trim();
    const translation: Translation = {
      id: generateShortId(),
      translation: '',
      aiModelId: '',
    };

    const newVolume: Volume = {
      id: idGenerator.generate(),
      title: {
        original: trimmedTitle,
        translation,
      },
      chapters: [],
    };

    return [...existingVolumes, newVolume];
  }

  /**
   * 更新卷信息
   * @param novel 小说对象
   * @param volumeId 卷 ID
   * @param data 更新的数据（如果 data.title 是字符串，则更新 title.original）
   * @returns 更新后的卷列表
   */
  static updateVolume(
    novel: Novel,
    volumeId: string,
    data: Omit<Partial<Volume>, 'title'> & { title?: string | Volume['title'] },
  ): Volume[] {
    const existingVolumes = novel.volumes || [];
    const index = existingVolumes.findIndex((v) => v.id === volumeId);
    if (index === -1) return existingVolumes;

    const updatedVolumes = [...existingVolumes];
    const existingVolume = updatedVolumes[index];
    if (existingVolume) {
      // 处理 title 更新：如果传入的是字符串，更新 title.original
      const { title: titleData, ...restData } = data;
      const updateData: Partial<Volume> = { ...restData };
      if (titleData) {
        if (typeof titleData === 'string') {
          // 兼容旧数据格式：如果现有 title 是字符串，创建新的翻译对象
          let existingTranslation;
          if (typeof existingVolume.title === 'string') {
            // 旧数据格式，创建新的翻译对象
            existingTranslation = {
              id: generateShortId(),
              translation: '',
              aiModelId: '',
            };
          } else {
            // 新数据格式，保留原有翻译
            existingTranslation = existingVolume.title.translation;
          }
          updateData.title = {
            original: titleData.trim(),
            translation: existingTranslation,
          };
        } else {
          updateData.title = titleData;
        }
      }
      updatedVolumes[index] = { ...existingVolume, ...updateData };
    }
    return updatedVolumes;
  }

  /**
   * 删除卷
   * @param novel 小说对象
   * @param volumeId 卷 ID
   * @returns 更新后的卷列表
   */
  static deleteVolume(novel: Novel, volumeId: string): Volume[] {
    const existingVolumes = novel.volumes || [];
    return existingVolumes.filter((v) => v.id !== volumeId);
  }

  /**
   * 添加新章节
   * @param novel 小说对象
   * @param volumeId 卷 ID
   * @param title 章节标题
   * @param content 章节内容（可选）
   * @returns 更新后的卷列表
   */
  static addChapter(
    novel: Novel,
    volumeId: string,
    title: string,
    content?: Paragraph[],
  ): Volume[] {
    const existingVolumes = novel.volumes || [];
    const volumeIndex = existingVolumes.findIndex((v) => v.id === volumeId);
    if (volumeIndex === -1) return existingVolumes;

    const volume = existingVolumes[volumeIndex];
    if (!volume) return existingVolumes;

    const existingChapters = volume.chapters || [];
    const chapterIds = extractIds(existingChapters);
    const idGenerator = new UniqueIdGenerator(chapterIds);
    const now = new Date();

    const trimmedTitle = title.trim();
    const translation: Translation = {
      id: generateShortId(),
      translation: '',
      aiModelId: '',
    };

    const newChapter: Chapter = {
      id: idGenerator.generate(),
      title: {
        original: trimmedTitle,
        translation,
      },
      lastEdited: now,
      createdAt: now,
      content: content,
    };

    const updatedChapters = [...existingChapters, newChapter];
    const updatedVolumes = [...existingVolumes];
    updatedVolumes[volumeIndex] = { ...volume, chapters: updatedChapters };

    return updatedVolumes;
  }

  /**
   * 更新章节
   * @param novel 小说对象
   * @param chapterId 章节 ID
   * @param data 更新的数据
   * @param targetVolumeId 目标卷 ID（如果需要移动）
   * @returns 更新后的卷列表
   */
  static updateChapter(
    novel: Novel,
    chapterId: string,
    data: Omit<Partial<Chapter>, 'title'> & { title?: string | Chapter['title'] },
    targetVolumeId?: string,
  ): Volume[] {
    const existingVolumes = [...(novel.volumes || [])];
    let sourceVolumeIndex = -1;
    let chapterIndex = -1;
    let chapterToUpdate: Chapter | null = null;

    // 查找章节
    for (let i = 0; i < existingVolumes.length; i++) {
      const volume = existingVolumes[i];
      if (volume && volume.chapters) {
        const index = volume.chapters.findIndex((c) => c.id === chapterId);
        if (index !== -1) {
          sourceVolumeIndex = i;
          chapterIndex = index;
          chapterToUpdate = volume.chapters[index] || null;
          break;
        }
      }
    }

    if (!chapterToUpdate || sourceVolumeIndex === -1) return existingVolumes;

    // 处理 title 更新：如果传入的是字符串，更新 title.original
    const { title: titleData, ...restData } = data;
    const updateData: Partial<Chapter> = { ...restData };
    if (titleData) {
      if (typeof titleData === 'string') {
        // 兼容旧数据格式：如果现有 title 是字符串，创建新的翻译对象
        let existingTranslation;
        if (typeof chapterToUpdate.title === 'string') {
          // 旧数据格式，创建新的翻译对象
          existingTranslation = {
            id: generateShortId(),
            translation: '',
            aiModelId: '',
          };
        } else {
          // 新数据格式，保留原有翻译
          existingTranslation = chapterToUpdate.title.translation;
        }
        updateData.title = {
          original: titleData.trim(),
          translation: existingTranslation,
        };
      } else {
        updateData.title = titleData;
      }
    }

    // 更新基本信息
    const updatedChapter: Chapter = {
      ...chapterToUpdate,
      ...updateData,
      lastEdited: new Date(), // 总是更新编辑时间
    };

    const sourceVolume = existingVolumes[sourceVolumeIndex];
    if (!sourceVolume) return existingVolumes;

    // 如果不需要移动，或者目标卷和源卷相同
    if (!targetVolumeId || targetVolumeId === sourceVolume.id) {
      const updatedChapters = [...(sourceVolume.chapters || [])];
      updatedChapters[chapterIndex] = updatedChapter;
      existingVolumes[sourceVolumeIndex] = { ...sourceVolume, chapters: updatedChapters };
      return existingVolumes;
    }

    // 如果需要移动到不同卷
    const targetVolumeIndex = existingVolumes.findIndex((v) => v.id === targetVolumeId);
    if (targetVolumeIndex === -1) return existingVolumes;

    // 1. 从源卷移除
    const sourceChapters = [...(sourceVolume.chapters || [])];
    sourceChapters.splice(chapterIndex, 1);
    existingVolumes[sourceVolumeIndex] = { ...sourceVolume, chapters: sourceChapters };

    // 2. 添加到目标卷
    const targetVolume = existingVolumes[targetVolumeIndex];
    if (!targetVolume) return existingVolumes;

    const targetChapters = [...(targetVolume.chapters || [])];
    targetChapters.push(updatedChapter);
    existingVolumes[targetVolumeIndex] = { ...targetVolume, chapters: targetChapters };

    return existingVolumes;
  }

  /**
   * 删除章节
   * @param novel 小说对象
   * @param chapterId 章节 ID
   * @returns 更新后的卷列表
   */
  static deleteChapter(novel: Novel, chapterId: string): Volume[] {
    const existingVolumes = novel.volumes || [];
    return existingVolumes.map((volume) => {
      if (volume.chapters && volume.chapters.some((c) => c.id === chapterId)) {
        return {
          ...volume,
          chapters: volume.chapters.filter((c) => c.id !== chapterId),
        };
      }
      return volume;
    });
  }

  /**
   * 移动章节（拖拽排序）
   * @param novel 小说对象
   * @param chapterId 章节 ID
   * @param targetVolumeId 目标卷 ID
   * @param targetIndex 目标索引（可选，如果不传则添加到末尾）
   * @returns 更新后的卷列表
   */
  static moveChapter(
    novel: Novel,
    chapterId: string,
    targetVolumeId: string,
    targetIndex?: number,
  ): Volume[] {
    const existingVolumes = [...(novel.volumes || [])];
    let sourceVolumeIndex = -1;
    let chapterIndex = -1;
    let chapterToMove: Chapter | null = null;

    // 查找并移除章节
    for (let i = 0; i < existingVolumes.length; i++) {
      const volume = existingVolumes[i];
      if (volume && volume.chapters) {
        const index = volume.chapters.findIndex((c) => c.id === chapterId);
        if (index !== -1) {
          sourceVolumeIndex = i;
          chapterIndex = index;
          chapterToMove = volume.chapters[index] || null;
          break;
        }
      }
    }

    if (!chapterToMove || sourceVolumeIndex === -1) return existingVolumes;

    // 1. 验证目标卷是否存在
    const targetVolumeIndex = existingVolumes.findIndex((v) => v.id === targetVolumeId);
    if (targetVolumeIndex === -1) return existingVolumes;

    // 2. 从源卷移除
    const sourceVolume = existingVolumes[sourceVolumeIndex];
    if (!sourceVolume) return existingVolumes;

    const sourceChapters = [...(sourceVolume.chapters || [])];
    sourceChapters.splice(chapterIndex, 1);
    existingVolumes[sourceVolumeIndex] = { ...sourceVolume, chapters: sourceChapters };

    // 3. 添加到目标卷
    // 注意：如果源卷和目标卷相同，我们需要使用更新后的 existingVolumes[sourceVolumeIndex] 作为目标卷
    // 因为上面已经修改了 existingVolumes[sourceVolumeIndex]

    const targetVolume = existingVolumes[targetVolumeIndex];
    if (!targetVolume) return existingVolumes;

    const targetChapters = [...(targetVolume.chapters || [])];

    const insertIndex =
      targetIndex !== undefined && targetIndex !== null ? targetIndex : targetChapters.length;

    targetChapters.splice(insertIndex, 0, chapterToMove);
    existingVolumes[targetVolumeIndex] = { ...targetVolume, chapters: targetChapters };

    return existingVolumes;
  }

  /**
   * 按关键词搜索段落
   * @param novel 小说对象
   * @param keyword 搜索关键词
   * @param chapterId 可选的章节 ID，如果提供则从该章节向前搜索（包括该章节及之前的所有章节）
   * @param maxParagraphs 可选的最大返回段落数量，默认为 1
   * @param onlyWithTranslation 是否只返回有翻译的段落，默认为 false
   * @returns 搜索结果数组，包含匹配的段落及其所在位置信息
   */
  /**
   * 根据关键词搜索段落（异步版本，按需加载章节内容，使用批量加载优化）
   * @param novel 小说对象
   * @param keyword 搜索关键词
   * @param chapterId 可选的章节 ID，如果提供则从该章节向前搜索
   * @param maxParagraphs 最大返回段落数量
   * @param onlyWithTranslation 是否只返回有翻译的段落
   * @returns 段落位置信息数组
   */
  static async searchParagraphsByKeywordAsync(
    novel: Novel | null | undefined,
    keyword: string,
    chapterId?: string,
    maxParagraphs: number = 1,
    onlyWithTranslation: boolean = false,
  ): Promise<ParagraphSearchResult[]> {
    if (!novel || !novel.volumes || !keyword.trim()) {
      return [];
    }

    const trimmedKeyword = keyword.trim().toLowerCase();

    // 如果提供了 chapterId，需要找到该章节的位置
    let targetVolumeIndex: number | null = null;
    let targetChapterIndex: number | null = null;

    if (chapterId) {
      // 查找目标章节的位置
      for (let vIndex = 0; vIndex < novel.volumes.length; vIndex++) {
        const volume = novel.volumes[vIndex];
        if (volume && volume.chapters) {
          const cIndex = volume.chapters.findIndex((c) => c.id === chapterId);
          if (cIndex !== -1) {
            targetVolumeIndex = vIndex;
            targetChapterIndex = cIndex;
            break;
          }
        }
      }

      // 如果找不到指定的章节，返回空结果
      if (targetVolumeIndex === null || targetChapterIndex === null) {
        return [];
      }
    }

    // 收集需要加载的章节（批量加载优化）
    const chaptersToLoad: { chapter: Chapter; vIndex: number; cIndex: number }[] = [];

    // 第一遍：收集需要加载的章节
    for (let vIndex = 0; vIndex < novel.volumes.length; vIndex++) {
      const volume = novel.volumes[vIndex];
      if (!volume || !volume.chapters) continue;

      // 如果指定了章节，且当前卷在目标卷之后，停止搜索
      if (chapterId && targetVolumeIndex !== null && vIndex > targetVolumeIndex) {
        break;
      }

      // 遍历章节
      for (let cIndex = 0; cIndex < volume.chapters.length; cIndex++) {
        const chapter = volume.chapters[cIndex];
        if (!chapter) continue;

        // 如果指定了章节，且当前章节在目标章节之后，停止搜索
        if (
          chapterId &&
          targetVolumeIndex !== null &&
          targetChapterIndex !== null &&
          vIndex === targetVolumeIndex &&
          cIndex > targetChapterIndex
        ) {
          break;
        }

        // 如果需要加载，添加到列表
        if (chapter.content === undefined) {
          chaptersToLoad.push({ chapter, vIndex, cIndex });
        }
      }
    }

    // 批量加载需要的章节
    if (chaptersToLoad.length > 0) {
      const chapterIds = chaptersToLoad.map((item) => item.chapter.id);
      const contentsMap = await ChapterContentService.loadChapterContentsBatch(chapterIds);

      // 更新章节内容
      for (const { chapter } of chaptersToLoad) {
        const content = contentsMap.get(chapter.id);
        chapter.content = content || [];
        chapter.contentLoaded = true;
      }
    }

    // 第二遍：在加载的章节中搜索
    const results: ParagraphSearchResult[] = [];

    for (let vIndex = 0; vIndex < novel.volumes.length; vIndex++) {
      const volume = novel.volumes[vIndex];
      if (!volume || !volume.chapters) continue;

      // 如果指定了章节，且当前卷在目标卷之后，停止搜索
      if (chapterId && targetVolumeIndex !== null && vIndex > targetVolumeIndex) {
        break;
      }

      // 遍历章节
      for (let cIndex = 0; cIndex < volume.chapters.length; cIndex++) {
        const chapter = volume.chapters[cIndex];
        if (!chapter) continue;

        // 如果指定了章节，且当前章节在目标章节之后，停止搜索
        if (
          chapterId &&
          targetVolumeIndex !== null &&
          targetChapterIndex !== null &&
          vIndex === targetVolumeIndex &&
          cIndex > targetChapterIndex
        ) {
          break;
        }

        // 如果仍未加载，按需加载（可能是在第一遍之后添加的新章节）
        if (chapter.content === undefined) {
          const content = await ChapterContentService.loadChapterContent(chapter.id);
          chapter.content = content || [];
          chapter.contentLoaded = true;
        }

        // 搜索段落
        if (chapter.content) {
          for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
            // 如果已达到最大返回数量，停止搜索
            if (results.length >= maxParagraphs) {
              break;
            }

            const paragraph = chapter.content[pIndex];
            if (paragraph && paragraph.text.toLowerCase().includes(trimmedKeyword)) {
              // 如果要求只返回有翻译的段落，检查段落是否有翻译
              if (onlyWithTranslation) {
                const hasTranslation =
                  paragraph.translations &&
                  paragraph.translations.length > 0 &&
                  paragraph.translations.some(
                    (t) => t.translation && t.translation.trim().length > 0,
                  );
                if (!hasTranslation) {
                  continue; // 跳过没有翻译的段落
                }
              }

              results.push({
                paragraph,
                paragraphIndex: pIndex,
                chapter,
                chapterIndex: cIndex,
                volume,
                volumeIndex: vIndex,
              });

              // 如果已达到最大返回数量，停止搜索
              if (results.length >= maxParagraphs) {
                break;
              }
            }
          }
        }

        // 如果已达到最大返回数量，停止搜索章节
        if (results.length >= maxParagraphs) {
          break;
        }
      }

      // 如果已达到最大返回数量，停止搜索卷
      if (results.length >= maxParagraphs) {
        break;
      }
    }

    return results;
  }

  static searchParagraphsByKeyword(
    novel: Novel | null | undefined,
    keyword: string,
    chapterId?: string,
    maxParagraphs: number = 1,
    onlyWithTranslation: boolean = false,
  ): ParagraphSearchResult[] {
    if (!novel || !novel.volumes || !keyword.trim()) {
      return [];
    }

    const results: ParagraphSearchResult[] = [];
    const trimmedKeyword = keyword.trim().toLowerCase();

    // 如果提供了 chapterId，需要找到该章节的位置
    let targetVolumeIndex: number | null = null;
    let targetChapterIndex: number | null = null;

    if (chapterId) {
      // 查找目标章节的位置
      for (let vIndex = 0; vIndex < novel.volumes.length; vIndex++) {
        const volume = novel.volumes[vIndex];
        if (volume && volume.chapters) {
          const cIndex = volume.chapters.findIndex((c) => c.id === chapterId);
          if (cIndex !== -1) {
            targetVolumeIndex = vIndex;
            targetChapterIndex = cIndex;
            break;
          }
        }
      }

      // 如果找不到指定的章节，返回空结果
      if (targetVolumeIndex === null || targetChapterIndex === null) {
        return [];
      }
    }

    // 遍历所有卷
    for (let vIndex = 0; vIndex < novel.volumes.length; vIndex++) {
      const volume = novel.volumes[vIndex];
      if (!volume || !volume.chapters) continue;

      // 如果指定了章节，且当前卷在目标卷之后，停止搜索
      if (chapterId && targetVolumeIndex !== null && vIndex > targetVolumeIndex) {
        break;
      }

      // 遍历章节
      for (let cIndex = 0; cIndex < volume.chapters.length; cIndex++) {
        const chapter = volume.chapters[cIndex];
        if (!chapter) continue;

        // 如果指定了章节，且当前章节在目标章节之后，停止搜索
        if (
          chapterId &&
          targetVolumeIndex !== null &&
          targetChapterIndex !== null &&
          vIndex === targetVolumeIndex &&
          cIndex > targetChapterIndex
        ) {
          break;
        }

        // 搜索段落
        if (chapter.content) {
          for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
            // 如果已达到最大返回数量，停止搜索
            if (results.length >= maxParagraphs) {
              break;
            }

            const paragraph = chapter.content[pIndex];
            if (paragraph && paragraph.text.toLowerCase().includes(trimmedKeyword)) {
              // 如果要求只返回有翻译的段落，检查段落是否有翻译
              if (onlyWithTranslation) {
                const hasTranslation =
                  paragraph.translations &&
                  paragraph.translations.length > 0 &&
                  paragraph.translations.some(
                    (t) => t.translation && t.translation.trim().length > 0,
                  );
                if (!hasTranslation) {
                  continue; // 跳过没有翻译的段落
                }
              }

              results.push({
                paragraph,
                paragraphIndex: pIndex,
                chapter,
                chapterIndex: cIndex,
                volume,
                volumeIndex: vIndex,
              });

              // 如果已达到最大返回数量，停止搜索
              if (results.length >= maxParagraphs) {
                break;
              }
            }
          }
        }

        // 如果已达到最大返回数量，停止搜索章节
        if (results.length >= maxParagraphs) {
          break;
        }
      }

      // 如果已达到最大返回数量，停止搜索卷
      if (results.length >= maxParagraphs) {
        break;
      }
    }

    return results;
  }

  /**
   * 通过段落 ID 查找段落位置信息
   * @param novel 小说对象
   * @param paragraphId 段落 ID
   * @returns 段落位置信息，如果未找到则返回 null
   */
  /**
   * 查找段落位置（按需加载章节内容，优化性能，使用批量加载）
   * @param novel 小说对象
   * @param paragraphId 段落 ID
   * @returns 段落位置信息，如果不存在则返回 null
   */
  static async findParagraphLocationAsync(
    novel: Novel | null | undefined,
    paragraphId: string,
  ): Promise<ParagraphSearchResult | null> {
    if (!novel || !novel.volumes || !paragraphId) {
      return null;
    }

    // 收集需要加载的章节 ID（批量加载优化）
    const chaptersToLoad: { chapter: Chapter; vIndex: number; cIndex: number }[] = [];

    // 第一遍：收集需要加载的章节
    for (let vIndex = 0; vIndex < novel.volumes.length; vIndex++) {
      const volume = novel.volumes[vIndex];
      if (!volume || !volume.chapters) continue;

      for (let cIndex = 0; cIndex < volume.chapters.length; cIndex++) {
        const chapter = volume.chapters[cIndex];
        if (!chapter) continue;

        // 如果章节内容已加载，直接检查
        if (chapter.content !== undefined) {
          if (chapter.content) {
            for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
              const paragraph = chapter.content[pIndex];
              if (paragraph && paragraph.id === paragraphId) {
                return {
                  paragraph,
                  paragraphIndex: pIndex,
                  chapter,
                  chapterIndex: cIndex,
                  volume,
                  volumeIndex: vIndex,
                };
              }
            }
          }
        } else {
          // 需要加载的章节
          chaptersToLoad.push({ chapter, vIndex, cIndex });
        }
      }
    }

    // 如果所有章节都已加载但没找到，返回 null
    if (chaptersToLoad.length === 0) {
      return null;
    }

    // 批量加载章节内容
    const chapterIds = chaptersToLoad.map((item) => item.chapter.id);
    const contentsMap = await ChapterContentService.loadChapterContentsBatch(chapterIds);

    // 第二遍：在加载的章节中查找
    for (const { chapter, vIndex, cIndex } of chaptersToLoad) {
      const content = contentsMap.get(chapter.id);
      chapter.content = content || [];
      chapter.contentLoaded = true;

      if (chapter.content) {
        for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
          const paragraph = chapter.content[pIndex];
          if (paragraph && paragraph.id === paragraphId) {
            const volume = novel.volumes[vIndex];
            if (!volume) continue;
            return {
              paragraph,
              paragraphIndex: pIndex,
              chapter,
              chapterIndex: cIndex,
              volume,
              volumeIndex: vIndex,
            };
          }
        }
      }
    }

    return null;
  }

  static findParagraphLocation(
    novel: Novel | null | undefined,
    paragraphId: string,
  ): ParagraphSearchResult | null {
    if (!novel || !novel.volumes || !paragraphId) {
      return null;
    }

    for (let vIndex = 0; vIndex < novel.volumes.length; vIndex++) {
      const volume = novel.volumes[vIndex];
      if (!volume || !volume.chapters) continue;

      for (let cIndex = 0; cIndex < volume.chapters.length; cIndex++) {
        const chapter = volume.chapters[cIndex];
        if (!chapter || !chapter.content) continue;

        for (let pIndex = 0; pIndex < chapter.content.length; pIndex++) {
          const paragraph = chapter.content[pIndex];
          if (paragraph && paragraph.id === paragraphId) {
            return {
              paragraph,
              paragraphIndex: pIndex,
              chapter,
              chapterIndex: cIndex,
              volume,
              volumeIndex: vIndex,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * 获取指定段落之前的 x 个段落（异步版本，按需加载章节内容，使用批量加载优化）
   * @param novel 小说对象
   * @param paragraphId 段落 ID
   * @param count 要获取的段落数量
   * @returns 段落位置信息数组，按从远到近的顺序排列（最远的在前）
   */
  static async getPreviousParagraphsAsync(
    novel: Novel | null | undefined,
    paragraphId: string,
    count: number,
  ): Promise<ParagraphSearchResult[]> {
    if (!novel || !novel.volumes || !paragraphId || count <= 0) {
      return [];
    }

    const location = await ChapterService.findParagraphLocationAsync(novel, paragraphId);
    if (!location) {
      return [];
    }

    const results: ParagraphSearchResult[] = [];
    const { volumeIndex, chapterIndex } = location;
    let { paragraphIndex } = location;

    // 从当前段落的前一个开始，向前遍历
    paragraphIndex--;

    // 收集需要加载的章节（批量加载优化）
    const chaptersToLoad = new Set<string>();
    const chapterMap = new Map<string, { chapter: Chapter; vIndex: number; cIndex: number }>();

    // 第一遍：收集需要加载的章节
    let vIdx = volumeIndex;
    let cIdx = chapterIndex;
    let pIdx = paragraphIndex;
    let collected = 0;

    while (collected < count * 2 && vIdx >= 0) {
      // 限制收集的章节数量，避免加载过多
      const volume = novel.volumes[vIdx];
      if (!volume || !volume.chapters) {
        vIdx--;
        cIdx =
          vIdx >= 0 && novel.volumes[vIdx]?.chapters
            ? novel.volumes[vIdx]!.chapters!.length - 1
            : -1;
        pIdx = -1;
        continue;
      }

      if (cIdx < 0) {
        vIdx--;
        if (vIdx < 0) break;
        const prevVolume = novel.volumes[vIdx];
        if (!prevVolume || !prevVolume.chapters || prevVolume.chapters.length === 0) {
          cIdx = -1;
          pIdx = -1;
          continue;
        }
        cIdx = prevVolume.chapters.length - 1;
        const prevChapter = prevVolume.chapters[cIdx];
        if (prevChapter && prevChapter.content === undefined) {
          chaptersToLoad.add(prevChapter.id);
          chapterMap.set(prevChapter.id, { chapter: prevChapter, vIndex: vIdx, cIndex: cIdx });
          collected++;
        }
        pIdx = prevChapter && prevChapter.content ? prevChapter.content.length - 1 : -1;
        continue;
      }

      const chapter = volume.chapters[cIdx];
      if (!chapter) {
        cIdx--;
        pIdx = -1;
        continue;
      }

      if (chapter.content === undefined) {
        chaptersToLoad.add(chapter.id);
        chapterMap.set(chapter.id, { chapter, vIndex: vIdx, cIndex: cIdx });
        collected++;
      }

      if (pIdx < 0) {
        cIdx--;
        if (cIdx < 0) {
          vIdx--;
          if (vIdx < 0) break;
          const prevVolume = novel.volumes[vIdx];
          if (!prevVolume || !prevVolume.chapters || prevVolume.chapters.length === 0) {
            cIdx = -1;
            pIdx = -1;
            continue;
          }
          cIdx = prevVolume.chapters.length - 1;
          const prevChapter = prevVolume.chapters[cIdx];
          if (prevChapter && prevChapter.content === undefined) {
            chaptersToLoad.add(prevChapter.id);
            chapterMap.set(prevChapter.id, { chapter: prevChapter, vIndex: vIdx, cIndex: cIdx });
            collected++;
          }
          pIdx = prevChapter && prevChapter.content ? prevChapter.content.length - 1 : -1;
          continue;
        }
        const prevChapter = volume.chapters[cIdx];
        if (prevChapter && prevChapter.content === undefined) {
          chaptersToLoad.add(prevChapter.id);
          chapterMap.set(prevChapter.id, { chapter: prevChapter, vIndex: vIdx, cIndex: cIdx });
          collected++;
        }
        pIdx = prevChapter && prevChapter.content ? prevChapter.content.length - 1 : -1;
        continue;
      }

      pIdx--;
    }

    // 批量加载需要的章节
    if (chaptersToLoad.size > 0) {
      const chapterIds = Array.from(chaptersToLoad);
      const contentsMap = await ChapterContentService.loadChapterContentsBatch(chapterIds);

      // 更新章节内容
      for (const [chapterId, content] of contentsMap) {
        const chapterInfo = chapterMap.get(chapterId);
        if (chapterInfo) {
          chapterInfo.chapter.content = content || [];
          chapterInfo.chapter.contentLoaded = true;
        }
      }
    }

    // 第二遍：重新遍历，这次所有需要的章节都已加载
    vIdx = volumeIndex;
    cIdx = chapterIndex;
    pIdx = paragraphIndex;

    while (results.length < count && vIdx >= 0) {
      const volume = novel.volumes[vIdx];
      if (!volume || !volume.chapters) {
        vIdx--;
        cIdx =
          vIdx >= 0 && novel.volumes[vIdx]?.chapters
            ? novel.volumes[vIdx]!.chapters!.length - 1
            : -1;
        pIdx = -1;
        continue;
      }

      if (cIdx < 0) {
        vIdx--;
        if (vIdx < 0) break;
        const prevVolume = novel.volumes[vIdx];
        if (!prevVolume || !prevVolume.chapters || prevVolume.chapters.length === 0) {
          cIdx = -1;
          pIdx = -1;
          continue;
        }
        cIdx = prevVolume.chapters.length - 1;
        const prevChapter = prevVolume.chapters[cIdx];
        // 如果仍未加载，按需加载
        if (prevChapter && prevChapter.content === undefined) {
          const content = await ChapterContentService.loadChapterContent(prevChapter.id);
          prevChapter.content = content || [];
          prevChapter.contentLoaded = true;
        }
        pIdx = prevChapter && prevChapter.content ? prevChapter.content.length - 1 : -1;
        continue;
      }

      const chapter = volume.chapters[cIdx];
      if (!chapter) {
        cIdx--;
        pIdx = -1;
        continue;
      }

      // 如果仍未加载，按需加载
      if (chapter.content === undefined) {
        const content = await ChapterContentService.loadChapterContent(chapter.id);
        chapter.content = content || [];
        chapter.contentLoaded = true;
      }

      if (!chapter.content) {
        cIdx--;
        pIdx = -1;
        continue;
      }

      if (pIdx < 0) {
        cIdx--;
        if (cIdx < 0) {
          vIdx--;
          if (vIdx < 0) break;
          const prevVolume = novel.volumes[vIdx];
          if (!prevVolume || !prevVolume.chapters || prevVolume.chapters.length === 0) {
            cIdx = -1;
            pIdx = -1;
            continue;
          }
          cIdx = prevVolume.chapters.length - 1;
          const prevChapter = prevVolume.chapters[cIdx];
          if (prevChapter && prevChapter.content === undefined) {
            const content = await ChapterContentService.loadChapterContent(prevChapter.id);
            prevChapter.content = content || [];
            prevChapter.contentLoaded = true;
          }
          pIdx = prevChapter && prevChapter.content ? prevChapter.content.length - 1 : -1;
          continue;
        }
        const prevChapter = volume.chapters[cIdx];
        if (prevChapter && prevChapter.content === undefined) {
          const content = await ChapterContentService.loadChapterContent(prevChapter.id);
          prevChapter.content = content || [];
          prevChapter.contentLoaded = true;
        }
        pIdx = prevChapter && prevChapter.content ? prevChapter.content.length - 1 : -1;
        continue;
      }

      const paragraph = chapter.content[pIdx];
      if (paragraph) {
        results.push({
          paragraph,
          paragraphIndex: pIdx,
          chapter,
          chapterIndex: cIdx,
          volume,
          volumeIndex: vIdx,
        });
      }

      pIdx--;
    }

    return results;
  }

  /**
   * 获取指定段落之前的 x 个段落
   * @param novel 小说对象
   * @param paragraphId 段落 ID
   * @param count 要获取的段落数量
   * @returns 段落位置信息数组，按从远到近的顺序排列（最远的在前）
   */
  static getPreviousParagraphs(
    novel: Novel | null | undefined,
    paragraphId: string,
    count: number,
  ): ParagraphSearchResult[] {
    if (!novel || !novel.volumes || !paragraphId || count <= 0) {
      return [];
    }

    const location = ChapterService.findParagraphLocation(novel, paragraphId);
    if (!location) {
      return [];
    }

    const results: ParagraphSearchResult[] = [];
    let { volumeIndex, chapterIndex, paragraphIndex } = location;

    // 从当前段落的前一个开始，向前遍历
    paragraphIndex--;

    while (results.length < count && volumeIndex >= 0) {
      const volume = novel.volumes[volumeIndex];
      if (!volume || !volume.chapters) {
        volumeIndex--;
        chapterIndex =
          volumeIndex >= 0 && novel.volumes[volumeIndex]?.chapters
            ? novel.volumes[volumeIndex]!.chapters!.length - 1
            : -1;
        paragraphIndex = -1;
        continue;
      }

      // 如果 chapterIndex 无效，移动到上一卷的最后一章
      if (chapterIndex < 0) {
        volumeIndex--;
        if (volumeIndex < 0) break;
        const prevVolume = novel.volumes[volumeIndex];
        if (!prevVolume || !prevVolume.chapters || prevVolume.chapters.length === 0) {
          chapterIndex = -1;
          paragraphIndex = -1;
          continue;
        }
        chapterIndex = prevVolume.chapters.length - 1;
        const prevChapter = prevVolume.chapters[chapterIndex];
        paragraphIndex = prevChapter && prevChapter.content ? prevChapter.content.length - 1 : -1;
        continue;
      }

      const chapter = volume.chapters[chapterIndex];
      if (!chapter || !chapter.content) {
        chapterIndex--;
        paragraphIndex = -1;
        continue;
      }

      // 如果 paragraphIndex 无效，移动到上一章的最后一个段落
      if (paragraphIndex < 0) {
        chapterIndex--;
        if (chapterIndex < 0) {
          // 移动到上一卷
          volumeIndex--;
          if (volumeIndex < 0) break;
          const prevVolume = novel.volumes[volumeIndex];
          if (!prevVolume || !prevVolume.chapters || prevVolume.chapters.length === 0) {
            chapterIndex = -1;
            paragraphIndex = -1;
            continue;
          }
          chapterIndex = prevVolume.chapters.length - 1;
          const prevChapter = prevVolume.chapters[chapterIndex];
          paragraphIndex = prevChapter && prevChapter.content ? prevChapter.content.length - 1 : -1;
          continue;
        }
        const prevChapter = volume.chapters[chapterIndex];
        paragraphIndex = prevChapter && prevChapter.content ? prevChapter.content.length - 1 : -1;
        continue;
      }

      // 获取当前段落
      const paragraph = chapter.content[paragraphIndex];
      if (paragraph) {
        results.unshift({
          paragraph,
          paragraphIndex,
          chapter,
          chapterIndex,
          volume,
          volumeIndex,
        });
      }

      paragraphIndex--;
    }

    return results;
  }

  /**
   * 获取指定段落之后的 x 个段落（异步版本，按需加载章节内容，使用批量加载优化）
   * @param novel 小说对象
   * @param paragraphId 段落 ID
   * @param count 要获取的段落数量
   * @returns 段落位置信息数组，按从近到远的顺序排列（最近的在前）
   */
  static async getNextParagraphsAsync(
    novel: Novel | null | undefined,
    paragraphId: string,
    count: number,
  ): Promise<ParagraphSearchResult[]> {
    if (!novel || !novel.volumes || !paragraphId || count <= 0) {
      return [];
    }

    const location = await ChapterService.findParagraphLocationAsync(novel, paragraphId);
    if (!location) {
      return [];
    }

    const results: ParagraphSearchResult[] = [];
    const { volumeIndex, chapterIndex } = location;
    let { paragraphIndex } = location;

    // 从当前段落的后一个开始，向后遍历
    paragraphIndex++;

    // 收集需要加载的章节（批量加载优化）
    const chaptersToLoad = new Set<string>();
    const chapterMap = new Map<string, { chapter: Chapter; vIndex: number; cIndex: number }>();
    let collected = 0;

    // 第一遍：收集需要加载的章节
    let vIdx = volumeIndex;
    let cIdx = chapterIndex;
    let pIdx = paragraphIndex;

    while (collected < count * 2 && vIdx < novel.volumes.length) {
      // 限制收集的章节数量，避免加载过多
      const volume = novel.volumes[vIdx];
      if (!volume || !volume.chapters) {
        vIdx++;
        cIdx = 0;
        pIdx = 0;
        continue;
      }

      if (cIdx >= volume.chapters.length) {
        vIdx++;
        if (vIdx >= novel.volumes.length) break;
        cIdx = 0;
        pIdx = 0;
        continue;
      }

      const chapter = volume.chapters[cIdx];
      if (!chapter) {
        cIdx++;
        pIdx = 0;
        continue;
      }

      if (chapter.content === undefined) {
        chaptersToLoad.add(chapter.id);
        chapterMap.set(chapter.id, { chapter, vIndex: vIdx, cIndex: cIdx });
        collected++;
      }

      if (pIdx >= (chapter.content?.length || 0)) {
        cIdx++;
        if (cIdx >= volume.chapters.length) {
          vIdx++;
          if (vIdx >= novel.volumes.length) break;
          cIdx = 0;
          pIdx = 0;
          continue;
        } else {
          const nextChapter = volume.chapters[cIdx];
          if (nextChapter && nextChapter.content === undefined) {
            chaptersToLoad.add(nextChapter.id);
            chapterMap.set(nextChapter.id, { chapter: nextChapter, vIndex: vIdx, cIndex: cIdx });
            collected++;
          }
          pIdx = 0;
          continue;
        }
      }

      pIdx++;
    }

    // 批量加载需要的章节
    if (chaptersToLoad.size > 0) {
      const chapterIds = Array.from(chaptersToLoad);
      const contentsMap = await ChapterContentService.loadChapterContentsBatch(chapterIds);

      // 更新章节内容
      for (const [chapterId, content] of contentsMap) {
        const chapterInfo = chapterMap.get(chapterId);
        if (chapterInfo) {
          chapterInfo.chapter.content = content || [];
          chapterInfo.chapter.contentLoaded = true;
        }
      }
    }

    // 第二遍：重新遍历，这次所有需要的章节都已加载
    vIdx = volumeIndex;
    cIdx = chapterIndex;
    pIdx = paragraphIndex;

    while (results.length < count && vIdx < novel.volumes.length) {
      const volume = novel.volumes[vIdx];
      if (!volume || !volume.chapters) {
        vIdx++;
        cIdx = 0;
        pIdx = 0;
        continue;
      }

      if (cIdx >= volume.chapters.length) {
        vIdx++;
        if (vIdx >= novel.volumes.length) break;
        cIdx = 0;
        pIdx = 0;
        continue;
      }

      const chapter = volume.chapters[cIdx];
      if (!chapter) {
        cIdx++;
        pIdx = 0;
        continue;
      }

      // 如果仍未加载，按需加载
      if (chapter.content === undefined) {
        const content = await ChapterContentService.loadChapterContent(chapter.id);
        chapter.content = content || [];
        chapter.contentLoaded = true;
      }

      if (!chapter.content) {
        cIdx++;
        pIdx = 0;
        continue;
      }

      if (pIdx >= chapter.content.length) {
        cIdx++;
        if (cIdx >= volume.chapters.length) {
          vIdx++;
          if (vIdx >= novel.volumes.length) break;
          cIdx = 0;
        }
        const nextChapter = volume.chapters[cIdx];
        if (nextChapter && nextChapter.content === undefined) {
          const content = await ChapterContentService.loadChapterContent(nextChapter.id);
          nextChapter.content = content || [];
          nextChapter.contentLoaded = true;
        }
        pIdx = 0;
        continue;
      }

      const paragraph = chapter.content[pIdx];
      if (paragraph) {
        results.push({
          paragraph,
          paragraphIndex: pIdx,
          chapter,
          chapterIndex: cIdx,
          volume,
          volumeIndex: vIdx,
        });
      }

      pIdx++;
    }

    return results;
  }

  /**
   * 获取指定段落之后的 x 个段落
   * @param novel 小说对象
   * @param paragraphId 段落 ID
   * @param count 要获取的段落数量
   * @returns 段落位置信息数组，按从近到远的顺序排列（最近的在前）
   */
  static getNextParagraphs(
    novel: Novel | null | undefined,
    paragraphId: string,
    count: number,
  ): ParagraphSearchResult[] {
    if (!novel || !novel.volumes || !paragraphId || count <= 0) {
      return [];
    }

    const location = ChapterService.findParagraphLocation(novel, paragraphId);
    if (!location) {
      return [];
    }

    const results: ParagraphSearchResult[] = [];
    let { volumeIndex, chapterIndex, paragraphIndex } = location;

    // 从当前段落的后一个开始，向后遍历
    paragraphIndex++;

    while (results.length < count && volumeIndex < novel.volumes.length) {
      const volume = novel.volumes[volumeIndex];
      if (!volume || !volume.chapters) {
        volumeIndex++;
        chapterIndex = 0;
        paragraphIndex = 0;
        continue;
      }

      // 如果 chapterIndex 超出范围，移动到下一卷的第一章
      if (chapterIndex >= volume.chapters.length) {
        volumeIndex++;
        if (volumeIndex >= novel.volumes.length) break;
        chapterIndex = 0;
        paragraphIndex = 0;
        continue;
      }

      const chapter = volume.chapters[chapterIndex];
      if (!chapter || !chapter.content) {
        chapterIndex++;
        paragraphIndex = 0;
        continue;
      }

      // 如果 paragraphIndex 超出范围，移动到下一章的第一个段落
      if (paragraphIndex >= chapter.content.length) {
        chapterIndex++;
        if (chapterIndex >= volume.chapters.length) {
          // 移动到下一卷
          volumeIndex++;
          if (volumeIndex >= novel.volumes.length) break;
          chapterIndex = 0;
        }
        paragraphIndex = 0;
        continue;
      }

      // 获取当前段落
      const paragraph = chapter.content[paragraphIndex];
      if (paragraph) {
        results.push({
          paragraph,
          paragraphIndex,
          chapter,
          chapterIndex,
          volume,
          volumeIndex,
        });
      }

      paragraphIndex++;
    }

    return results;
  }

  /**
   * 添加段落翻译，并限制最多保留5个翻译版本
   * 新翻译添加到末尾，如果超过5个则删除最旧的（数组开头的）
   * @param existingTranslations 现有的翻译数组
   * @param newTranslation 新的翻译对象
   * @returns 更新后的翻译数组（最多5个）
   */
  static addParagraphTranslation(
    existingTranslations: Translation[],
    newTranslation: Translation,
  ): Translation[] {
    const MAX_TRANSLATIONS = 5;
    const updated = [...(existingTranslations || []), newTranslation];
    // 如果超过最大数量，只保留最后5个（最新的）
    return updated.slice(-MAX_TRANSLATIONS);
  }

  /**
   * 导出章节内容
   * @param chapter 章节对象
   * @param type 导出类型：'original' 原文、'translation' 翻译、'bilingual' 双语
   * @param format 导出格式：'txt' 文本文件、'json' JSON 文件、'clipboard' 剪贴板
   * @returns Promise，当 format 为 'clipboard' 时返回 Promise，否则返回 void
   */
  static async exportChapter(
    chapter: Chapter,
    type: 'original' | 'translation' | 'bilingual',
    format: 'txt' | 'json' | 'clipboard',
  ): Promise<void> {
    if (!chapter || !chapter.content || chapter.content.length === 0) {
      throw new Error('章节内容为空，无法导出');
    }

    const chapterTitle = getChapterDisplayTitle(chapter);
    let content = '';

    // 构建导出内容
    if (format === 'json') {
      const data = chapter.content.map((p) => ({
        original: p.text,
        translation: getParagraphTranslationText(p),
      }));
      content = JSON.stringify(
        {
          title: chapterTitle,
          content: data,
        },
        null,
        2,
      );
    } else {
      const lines = chapter.content.map((p) => {
        const original = p.text;
        const translation = getParagraphTranslationText(p);

        // 规范化换行符：确保翻译文本的换行符数量与原文一致
        // 如果原文没有换行符，翻译也不应有
        // 如果原文末尾有换行符，翻译也应有
        let normalizedTranslation = translation || original;

        // 检测原文末尾的换行符数量
        const originalTrailingNewlines = (original.match(/\n+$/) || [''])[0].length;
        // 移除翻译末尾的所有换行符
        normalizedTranslation = normalizedTranslation.replace(/\n+$/, '');
        // 添加与原文相同数量的换行符
        normalizedTranslation += '\n'.repeat(originalTrailingNewlines);

        switch (type) {
          case 'original':
            return original;
          case 'translation':
            // 规范化后的翻译文本已经包含了与原文一致的换行符
            return normalizedTranslation;
          case 'bilingual':
            return `${original}\n${normalizedTranslation}\n`;
          default:
            return '';
        }
      });
      content = `${chapterTitle}\n\n${lines.join('\n')}`;
    }

    // 执行导出动作
    if (format === 'clipboard') {
      try {
        await navigator.clipboard.writeText(content);
      } catch (err) {
        throw new Error(
          err instanceof Error
            ? `复制到剪贴板失败：${err.message}`
            : '复制到剪贴板失败：请重试或检查权限',
        );
      }
    } else {
      const blob = new Blob([content], {
        type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${chapterTitle}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }

  // --- 懒加载相关方法 ---

  /**
   * 加载章节内容（懒加载）
   * @param chapter 章节对象（可能没有内容）
   * @returns 包含内容的章节对象
   */
  static async loadChapterContent(chapter: Chapter): Promise<Chapter> {
    // 如果内容已存在，直接返回
    if (chapter.content !== undefined) {
      return chapter;
    }

    // 从独立存储加载
    const content = await ChapterContentService.loadChapterContent(chapter.id);

    return {
      ...chapter,
      content: content || [],
      contentLoaded: true,
    };
  }

  /**
   * 保存章节内容到独立存储
   * @param chapter 章节对象
   */
  static async saveChapterContent(chapter: Chapter): Promise<void> {
    if (chapter.content && chapter.content.length > 0) {
      await ChapterContentService.saveChapterContent(chapter.id, chapter.content);
    }
  }

  /**
   * 删除章节内容（从独立存储）
   * @param chapterId 章节 ID
   */
  static async deleteChapterContent(chapterId: string): Promise<void> {
    await ChapterContentService.deleteChapterContent(chapterId);
  }
}
