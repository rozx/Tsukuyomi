# Composables 单元测试总结

> 为所有 composables 创建单元测试的总结文档

## 测试框架

- **测试框架**: Bun Test
- **测试文件位置**: `src/__tests__/`
- **测试文件命名**: `use-{composable-name}.test.ts`

## 已创建的测试文件

### ✅ 1. `use-action-info-toast.test.ts`

测试 `useActionInfoToast` composable 的功能：
- ✅ `countUniqueActions` 纯函数测试（6 个测试用例）
  - 正确统计唯一的术语操作
  - 正确统计唯一的角色操作
  - 忽略不支持的操作类型
  - 忽略不支持的实体类型
  - 处理空数组
  - 处理没有 ID 的操作
- ✅ `useActionInfoToast` composable 测试（6 个测试用例）
  - 显示创建术语的 toast
  - 显示更新角色的 toast
  - 显示删除术语的 toast
  - 忽略不支持的操作类型
  - 使用自定义的 severity
  - 支持撤销功能

**测试状态**: ✅ 12 个测试用例全部通过

### ✅ 2. `use-chapter-export.test.ts`

测试 `useChapterExport` composable 的功能：
- ✅ 创建导出菜单引用
- ✅ 创建导出菜单项
- ✅ 导出成功时显示成功 toast (clipboard)
- ✅ 导出成功时显示成功 toast (file)
- ✅ 导出失败时显示错误 toast
- ✅ 复制所有翻译文本成功时显示成功 toast
- ✅ 章节为空时显示警告

**测试状态**: ✅ 7 个测试用例全部通过

### ✅ 3. `use-chapter-drag-drop.test.ts`

测试 `useChapterDragDrop` composable 的功能：
- ✅ 初始化拖拽状态
- ✅ 在拖拽开始时设置状态
- ✅ 在拖拽结束时清除状态
- ✅ 在拖拽悬停时更新状态
- ✅ 在放下时移动章节
- ✅ 在书籍为空时不执行移动

**测试状态**: ✅ 6 个测试用例全部通过

**特殊处理**: 
- Mock 了 `DragEvent` 和 `HTMLElement` 以支持 Node.js/Bun 环境

### ✅ 4. `use-paragraph-translation.test.ts`

测试 `useParagraphTranslation` composable 的功能：
- ✅ 初始化编辑状态
- ✅ 更新段落翻译
- ✅ 选择段落翻译
- ✅ 在翻译ID不存在时显示错误
- ✅ 更新 selectedChapterWithContent

**测试状态**: ✅ 5 个测试用例全部通过

### ✅ 5. `use-edit-mode.test.ts`

测试 `useEditMode` composable 的功能：
- ✅ 初始化编辑模式为 translation
- ✅ 计算章节原始文本
- ✅ 开始编辑原始文本
- ✅ 取消编辑原始文本
- ✅ 保存编辑后的原始文本

**测试状态**: ✅ 5 个测试用例全部通过

## 待创建的测试文件

### ✅ 6. `use-paragraph-navigation.test.ts`

已测试的功能：
- ✅ 段落导航状态管理（15 个测试用例）
- ✅ 段落选择（键盘选中、点击选中）
- ✅ 段落导航函数（`navigateToParagraph`, `handleParagraphClick`）
- ✅ 段落编辑管理
- ✅ 清理函数
- ✅ 非空段落查找逻辑
- ✅ 空段落跳过逻辑

**测试状态**: ✅ 15 个测试用例全部通过

**特殊处理**: 
- Mock 了 `HTMLElement`, `requestAnimationFrame`, `document.getElementById`
- 测试了核心逻辑，简化了 DOM 相关测试

### ✅ 7. `use-keyboard-shortcuts.test.ts`

已测试的功能：
- ✅ 键盘快捷键处理（`handleKeydown`）（13 个测试用例）
- ✅ 事件处理（`handleClick`, `handleMouseMove`, `handleScroll`）
- ✅ 主要快捷键组合（Ctrl+F, Ctrl+H, F3, Shift+F3, Escape, Ctrl+Shift+C, Ctrl+Z, Ctrl+Y）
- ✅ 输入框中的快捷键忽略逻辑

**测试状态**: ✅ 13 个测试用例全部通过

**特殊处理**: 
- Mock 了键盘事件和鼠标事件
- 测试了核心快捷键功能，简化了复杂的段落导航集成测试

### ✅ 8. `use-chapter-translation.test.ts`

已测试的功能：
- ✅ 初始化状态（9 个测试用例）
- ✅ 翻译状态计算（无翻译/部分翻译/全部翻译）
- ✅ 翻译按钮标签和菜单项
- ✅ 翻译进度状态管理
- ✅ 取消翻译和润色功能

**测试状态**: ✅ 9 个测试用例全部通过

**特殊处理**: 
- Mock 了所有 AI 服务调用（TranslationService, PolishService）
- Mock 了所有 store 依赖（BooksStore, AIModelsStore, AIProcessingStore）
- 测试了核心功能和状态管理，简化了复杂的异步操作测试
- 注意：测试环境中会有 Vue onUnmounted 警告，这是预期的（没有真实的组件实例）

## 测试覆盖率统计

### 当前覆盖率

| Composable                | 测试文件 | 测试用例数 | 状态 |
| ------------------------- | -------- | ---------- | ---- |
| `useActionInfoToast`      | ✅        | 12         | 通过 |
| `useChapterExport`        | ✅        | 7          | 通过 |
| `useChapterDragDrop`      | ✅        | 6          | 通过 |
| `useParagraphTranslation` | ✅        | 5          | 通过 |
| `useEditMode`             | ✅        | 5          | 通过 |
| `useParagraphNavigation`  | ✅        | 15         | 通过 |
| `useKeyboardShortcuts`    | ✅        | 13         | 通过 |
| `useChapterTranslation`   | ✅        | 9          | 通过 |

**总计**: 8/8 composables 已测试，72 个测试用例

## 测试模式和最佳实践

### Mock 策略

1. **Vue 响应式系统**: 直接使用 `ref` 和 `computed`，无需 mock
2. **Pinia Stores**: Mock store 的返回值
3. **服务层**: Mock 服务方法
4. **浏览器 API**: 
   - `DragEvent` 和 `HTMLElement` 需要 mock（用于 Node.js/Bun 环境）
   - `console` 方法可以 mock 以避免测试输出干扰

### 测试辅助函数

每个测试文件包含：
- Mock 设置（dependencies）
- Helper 函数（创建测试数据）
- 测试用例组织（按功能分组）

### 示例：Mock 设置

```typescript
const mockToastAdd = mock(() => {});
const mockUseToastWithHistory = mock(() => ({
  add: mockToastAdd,
}));

await mock.module('src/composables/useToastHistory', () => ({
  useToastWithHistory: mockUseToastWithHistory,
}));
```

### 示例：测试用例

```typescript
it('应该显示创建术语的 toast', () => {
  const bookRef = ref<Novel | undefined>(mockBook);
  const { handleActionInfoToast } = useActionInfoToast(bookRef);

  const action: ActionInfo = { /* ... */ };
  handleActionInfoToast(action);

  expect(mockToastAdd).toHaveBeenCalledTimes(1);
  const callArgs = mockToastAdd.mock.calls[0]![0];
  expect(callArgs.severity).toBe('info');
  expect(callArgs.summary).toBe('已创建术语');
});
```

## 运行测试

```bash
# 运行所有 composable 测试
bun test src/__tests__/use-*.test.ts

# 运行特定测试
bun test src/__tests__/use-action-info-toast.test.ts
```

## 测试完成情况

### ✅ 所有 Composables 测试已完成

所有 8 个 composables 的测试文件都已创建并通过：

1. ✅ `use-action-info-toast.test.ts` - 12 个测试用例
2. ✅ `use-chapter-export.test.ts` - 7 个测试用例
3. ✅ `use-chapter-drag-drop.test.ts` - 6 个测试用例
4. ✅ `use-paragraph-translation.test.ts` - 5 个测试用例
5. ✅ `use-edit-mode.test.ts` - 5 个测试用例
6. ✅ `use-paragraph-navigation.test.ts` - 15 个测试用例
7. ✅ `use-keyboard-shortcuts.test.ts` - 13 个测试用例
8. ✅ `use-chapter-translation.test.ts` - 9 个测试用例

**总计**: 72 个测试用例，全部通过 ✅

## 注意事项

1. **异步操作**: 确保所有异步操作都被正确等待（使用 `await`）
2. **Mock 清理**: 在 `beforeEach` 中清理所有 mock 状态
3. **DOM API**: 需要 mock 的浏览器 API（`DragEvent`, `HTMLElement` 等）
4. **依赖关系**: 某些 composables 相互依赖，需要仔细处理测试顺序
5. **测试数据**: 使用 helper 函数创建一致的测试数据

---

**最后更新**: 2024-12-19
**测试状态**: ✅ **所有 8/8 composables 已测试，72 个测试用例全部通过！**

