import co from 'co';
import { TerminologyService } from 'src/services/terminology-service';
import { CharacterSettingService } from 'src/services/character-setting-service';

/**
 * 后台刷新所有术语和角色的出现次数
 * @param bookId 书籍 ID
 * @param moduleName 模块名称（用于日志记录，例如 'useChapterManagement' 或 'useEditMode'）
 */
export function refreshAllOccurrencesInBackground(bookId: string, moduleName: string): void {
  void co(function* () {
    try {
      // 刷新术语出现次数
      yield TerminologyService.refreshAllTermOccurrences(bookId);
      console.log(`[${moduleName}] 成功刷新所有术语出现次数`);
    } catch (error) {
      console.error(`[${moduleName}] 刷新所有术语出现次数失败:`, error);
    }

    try {
      // 刷新角色出现次数
      yield CharacterSettingService.refreshAllCharacterOccurrences(bookId);
      console.log(`[${moduleName}] 成功刷新所有角色出现次数`);
    } catch (error) {
      console.error(`[${moduleName}] 刷新所有角色出现次数失败:`, error);
    }
  });
}

/**
 * 移除指定章节的出现记录（用于章节删除时的优化）
 * 比 refreshAllOccurrencesInBackground 更高效，只需移除该章节的记录，无需重新扫描所有章节
 * @param bookId 书籍 ID
 * @param chapterId 要移除的章节 ID
 * @param moduleName 模块名称（用于日志记录）
 */
export function removeChapterOccurrencesInBackground(
  bookId: string,
  chapterId: string,
  moduleName: string,
): void {
  void co(function* () {
    try {
      // 移除术语中该章节的出现记录
      yield TerminologyService.removeChapterOccurrences(bookId, chapterId);
      console.log(`[${moduleName}] 成功移除章节 ${chapterId} 的术语出现记录`);
    } catch (error) {
      console.error(`[${moduleName}] 移除章节 ${chapterId} 的术语出现记录失败:`, error);
    }

    try {
      // 移除角色中该章节的出现记录
      yield CharacterSettingService.removeChapterOccurrences(bookId, chapterId);
      console.log(`[${moduleName}] 成功移除章节 ${chapterId} 的角色出现记录`);
    } catch (error) {
      console.error(`[${moduleName}] 移除章节 ${chapterId} 的角色出现记录失败:`, error);
    }
  });
}

