/**
 * syosetu.org 小说章节信息
 */
export interface SyosetuChapter {
  title: string;
  url: string;
  date?: string;
}

/**
 * syosetu.org 卷信息
 */
export interface SyosetuVolumeInfo {
  title: string;
  startIndex: number; // 该卷开始的章节索引
}

/**
 * syosetu.org 小说信息
 */
export interface SyosetuNovelInfo {
  title: string;
  author?: string;
  description?: string;
  tags?: string[];
  chapters: SyosetuChapter[];
  volumes?: SyosetuVolumeInfo[]; // 卷信息（可选）
  webUrl: string;
}
