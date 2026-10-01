# 实施覆盖清单

任务 1.1 的代码盘点，基线为规划提交 `10dcaa78`。本清单是迁移入口索引，不把汉字扫描命中数当作待翻译词条数；注释和日志需要在逐模块迁移时区分。

## 文案归属与验收范围

| 范围                                                 | 任务归属  | 验收                                                         |
| ---------------------------------------------------- | --------- | ------------------------------------------------------------ |
| src/pages、layouts 与所有 Desktop/Tablet/Mobile 变体 | 10.1–10.5 | 模板文字、动态菜单、CSS content、aria、tooltip、placeholder  |
| src/components、composables、stores、utils           | 6、7、10  | 用户反馈/状态/校验、持久历史固定标签、日期数字、直接译文字段 |
| src/services/ai 与 src/services/import               | 7–9       | 全提示词、嵌套工具参数说明、todo、错误说明和导入工作台       |
| src-electron                                         | 2.4       | splash、菜单、原生错误/更新/退出等产品文案                   |
| src/i18n 与 boot                                     | 1、2      | 三语言资源、类型、框架 locale、hydration                     |
| public/help                                          | 11        | 16 篇指南正文、索引元信息、稳定链接与锚点                    |
| public/releaseNotes                                  | 11        | 正文保留原文，仅索引导航和简介本地化                         |
| index.html                                           | 2.3       | document lang、启动文案                                      |

## 扫描例外

- 开发日志、代码注释、测试夹具与声明文件不作为产品翻译文本。用户可见错误包装不在例外内。
- 用户正文、历史聊天、用户说明及模型生成的自由文本保持原文；系统提供的固定说明仍须迁移。
- API 字段、工具名、枚举值、URL、模型 ID、路径、正则和模板示例的协议部分保持原样，例旁说明本地化。
- 品牌名保持既定拼写；数字、版本号与标识符不是语言资源 key。
- CSS 的可见 content 不属于样式例外；英文硬编码也需在逐页审查中迁移。

## 含中文的生产文件（包括待排除注释）

### src

```text
src/App.vue
```

### src/boot

```text
src/boot/toast-history.ts
```

### src/components/ai

```text
src/components/ai/ThinkingDetailDialog.vue
src/components/ai/ThinkingProcessBody.vue
src/components/ai/ThinkingProcessPanel.vue
src/components/ai/ThinkingReviewedCard.vue
src/components/ai/ThinkingTaskCard.vue
```

### src/components/book-sync

```text
src/components/book-sync/BookSyncWorkspace.vue
src/components/book-sync/BookSyncWorkspaceDesktop.vue
src/components/book-sync/BookSyncWorkspaceMobile.vue
src/components/book-sync/BookSyncWorkspaceTablet.vue
src/components/book-sync/book-sync.css
src/components/book-sync/fragments/ApplyBar.vue
src/components/book-sync/fragments/ApplyConfirm.vue
src/components/book-sync/fragments/ChapterPreviewText.vue
src/components/book-sync/fragments/CheckingState.vue
src/components/book-sync/fragments/FailedList.vue
src/components/book-sync/fragments/HandoffNotice.vue
src/components/book-sync/fragments/NewChapterGroupHead.vue
src/components/book-sync/fragments/NewChapterGroups.vue
src/components/book-sync/fragments/ParagraphDiffView.vue
src/components/book-sync/fragments/RecipeHeader.vue
src/components/book-sync/fragments/SelectableChapterRow.vue
src/components/book-sync/fragments/SkippedList.vue
src/components/book-sync/fragments/SourceUrlForm.vue
src/components/book-sync/fragments/SyncVerdict.vue
src/components/book-sync/fragments/UpdatedChapterList.vue
```

### src/components/dialogs

```text
src/components/dialogs/AIModelDialog.vue
src/components/dialogs/AddChapterDialog.vue
src/components/dialogs/AddVolumeDialog.vue
src/components/dialogs/AiCustomHeaders.vue
src/components/dialogs/AiModelBasicFields.vue
src/components/dialogs/AiModelSelector.vue
src/components/dialogs/AiTaskDefaultItem.vue
src/components/dialogs/AiTokenField.vue
src/components/dialogs/AskUserChoices.vue
src/components/dialogs/AskUserDialog.vue
src/components/dialogs/AskUserFooter.vue
src/components/dialogs/BatchEmbeddingsTestQueryDialog.vue
src/components/dialogs/BatchQueryResults.vue
src/components/dialogs/BookChapterList.vue
src/components/dialogs/BookChapterRow.vue
src/components/dialogs/BookCoverPanel.vue
src/components/dialogs/BookDialog.vue
src/components/dialogs/BookVolumesTree.vue
src/components/dialogs/BookWebUrlList.vue
src/components/dialogs/ChapterDateStats.vue
src/components/dialogs/CharacterEditDialog.vue
src/components/dialogs/CoverHistoryGrid.vue
src/components/dialogs/CoverManagerDialog.vue
src/components/dialogs/CoverPreviewInfo.vue
src/components/dialogs/DeleteChapterConfirmDialog.vue
src/components/dialogs/DeleteCharacterConfirmDialog.vue
src/components/dialogs/DeleteTermConfirmDialog.vue
src/components/dialogs/DeleteVolumeConfirmDialog.vue
src/components/dialogs/EditChapterDialog.vue
src/components/dialogs/EditVolumeDialog.vue
src/components/dialogs/QuickStartGuideDialog.vue
src/components/dialogs/RestoreDeletedItemsDialog.vue
src/components/dialogs/TermEditDialog.vue
src/components/dialogs/ToastHistoryBody.vue
src/components/dialogs/ToastHistoryDialog.vue
src/components/dialogs/TranslationHistoryDialog.vue
src/components/dialogs/ai-model-form-types.ts
src/components/dialogs/special-instructions-tabs.css
```

### src/components/import

```text
src/components/import/ImportAskItem.vue
src/components/import/ImportChapterPreview.vue
src/components/import/ImportChatBody.vue
src/components/import/ImportChatHeader.vue
src/components/import/ImportChatPanel.vue
src/components/import/ImportDraftChapterRow.vue
src/components/import/ImportDraftMetadata.vue
src/components/import/ImportDraftPanel.vue
src/components/import/ImportDraftVolume.vue
src/components/import/ImportExcludedList.vue
src/components/import/ImportFilterChips.vue
src/components/import/ImportHistoryList.vue
src/components/import/ImportMetadataCandidates.vue
src/components/import/ImportNovelChoice.vue
src/components/import/ImportPlanChapters.vue
src/components/import/ImportPlanConflicts.vue
src/components/import/ImportPlanDetails.vue
src/components/import/ImportPlanHero.vue
src/components/import/ImportPlanPanel.vue
src/components/import/ImportPlanRecipe.vue
src/components/import/ImportPlanStats.vue
src/components/import/ImportQuestionCard.vue
src/components/import/ImportRunBar.vue
src/components/import/ImportSourceAdd.vue
src/components/import/ImportSourcePanel.vue
src/components/import/ImportSourceRow.vue
src/components/import/ImportSourceViewer.vue
src/components/import/ImportTaskList.vue
src/components/import/import-ask.ts
src/components/import/import-card.css
src/components/import/import-draft.ts
src/components/import/import-labels.ts
```

### src/components/index

```text
src/components/index/IndexHeroCardHeading.vue
```

### src/components/layout

```text
src/components/layout/AdaptiveDialog.vue
src/components/layout/AppChatPanelDesktop.vue
src/components/layout/AppFooter.vue
src/components/layout/AppHeader.vue
src/components/layout/AppProgressPanelDesktop.vue
src/components/layout/AppRightPanelDesktop.vue
src/components/layout/AppSideMenu.vue
src/components/layout/AssistantAvatar.vue
src/components/layout/ChatActionBadge.vue
src/components/layout/ChatActionDetailsPopover.vue
src/components/layout/ChatActionPopovers.vue
src/components/layout/ChatGroupedActionPopover.vue
src/components/layout/ChatMessageItem.vue
src/components/layout/ChatMessageList.vue
src/components/layout/ChatMessageThinking.vue
src/components/layout/ChatSendButton.vue
src/components/layout/ChatSessionListPopover.vue
src/components/layout/ChatTodoSection.vue
src/components/layout/MobileBottomSheet.vue
src/components/layout/MobileChatSheet.vue
src/components/layout/MobileProgressSheet.vue
src/components/layout/MobileSysBar.vue
src/components/layout/MobileTabBar.vue
src/components/layout/NotificationBadge.vue
src/components/layout/RightPanelRail.vue
src/components/layout/TabletChatPanel.vue
src/components/layout/TabletNavRail.vue
src/components/layout/TabletProgressPanel.vue
src/components/layout/TabletSideRail.vue
src/components/layout/TabletSysBar.vue
src/components/layout/chat-badge/ChatBadgeAsk.vue
src/components/layout/chat-badge/ChatBadgeFindParagraph.vue
src/components/layout/chat-badge/ChatBadgeNavigate.vue
src/components/layout/chat-badge/ChatBadgeReadInfo.vue
src/components/layout/chat-badge/ChatBadgeReadSearch.vue
src/components/layout/chat-badge/ChatBadgeReadSearchKw.vue
src/components/layout/chat-badge/ChatBadgeReadValue.vue
src/components/layout/chat-badge/ChatBadgeSimple.vue
src/components/layout/chat-badge/ChatBadgeTranslation.vue
src/components/layout/chat-badge/badge-detail.ts
src/components/layout/chat-message-types.ts
src/components/layout/chat-panel.css
src/components/layout/rail-base.css
```

### src/components/novel

```text
src/components/novel/BatchEmbeddingsActiveTask.vue
src/components/novel/BatchEmbeddingsBackendStatus.vue
src/components/novel/BatchEmbeddingsDisabledNotice.vue
src/components/novel/BatchEmbeddingsPanel.vue
src/components/novel/BatchEmbeddingsStaleBanner.vue
src/components/novel/BookTranslationSettingsForm.vue
src/components/novel/BookTranslationSettingsPanel.vue
src/components/novel/BookUpdatePanel.vue
src/components/novel/ChapterContentPanel.vue
src/components/novel/ChapterEmptyState.vue
src/components/novel/ChapterHeader.vue
src/components/novel/ChapterListItem.vue
src/components/novel/ChapterNavigation.vue
src/components/novel/ChapterParagraphRow.vue
src/components/novel/ChapterPreviewSection.vue
src/components/novel/ChapterScrollbar.vue
src/components/novel/ChapterSettingsBody.vue
src/components/novel/ChapterSettingsPopover.vue
src/components/novel/ChapterToolbar.vue
src/components/novel/ChapterToolbarTablet.vue
src/components/novel/ChapterVirtualParagraphRow.vue
src/components/novel/CharacterPopover.vue
src/components/novel/CharacterSettingPanel.vue
src/components/novel/KeyboardShortcutsPopover.vue
src/components/novel/MemoryCard.vue
src/components/novel/MemoryDetailDialog.vue
src/components/novel/MemoryListEmptyState.vue
src/components/novel/MemoryPanel.vue
src/components/novel/MemoryQueueProgressBanner.vue
src/components/novel/MemoryReferencePanel.vue
src/components/novel/ParagraphCard.vue
src/components/novel/ParagraphCharacterPopoverList.vue
src/components/novel/ParagraphHighlightedText.vue
src/components/novel/ParagraphPopovers.vue
src/components/novel/PreviewParagraphItem.vue
src/components/novel/SearchToolbar.vue
src/components/novel/SettingCard.vue
src/components/novel/SettingCardAliases.vue
src/components/novel/SettingCardTranslations.vue
src/components/novel/TabletChapterRow.vue
src/components/novel/TermPopover.vue
src/components/novel/TerminologyPanel.vue
src/components/novel/ToolbarBadgeButton.vue
src/components/novel/TranslationProgressDesktop.vue
src/components/novel/TranslationProgressMobile.vue
src/components/novel/VolumesList.vue
src/components/novel/VolumesListTablet.vue
src/components/novel/panel-header.css
src/components/novel/picker-empty-hint.css
src/components/novel/preview-paragraph.css
src/components/novel/setting-panel.css
src/components/novel/translation-progress/MobileProgressBody.vue
src/components/novel/translation-progress/StreamPart.vue
src/components/novel/translation-progress/StreamStateTransition.vue
src/components/novel/translation-progress/StreamThinkingBlock.vue
src/components/novel/translation-progress/StreamToolCall.vue
src/components/novel/translation-progress/TaskActionBar.vue
src/components/novel/translation-progress/TaskEmptyState.vue
src/components/novel/translation-progress/TaskStatusBar.vue
src/components/novel/translation-progress/TaskStream.vue
src/components/novel/translation-progress/TaskSwitcher.vue
src/components/novel/translation-progress/TaskSwitcherItem.vue
src/components/novel/translation-progress/TaskTodos.vue
src/components/novel/translation-progress/task-switcher-dot.css
src/components/novel/volume-tree-row.css
src/components/novel/volumes-list-utils.ts
```

### src/components/settings

```text
src/components/settings/AIModelSettingsTab.vue
src/components/settings/AboutSection.vue
src/components/settings/ApiKeysSettingsTab.vue
src/components/settings/DesktopUpdateSection.vue
src/components/settings/EmbeddingSettingsTab.vue
src/components/settings/ImportExportTab.vue
src/components/settings/ProxyEditDialog.vue
src/components/settings/ProxyListTable.vue
src/components/settings/ProxyOptionLabel.vue
src/components/settings/ProxySettingsTab.vue
src/components/settings/ScraperSettingsTab.vue
src/components/settings/SiteMappingEditDialog.vue
src/components/settings/SiteMappingSettingsTab.vue
src/components/settings/SyncRevisionCard.vue
src/components/settings/SyncRevisionFileList.vue
src/components/settings/SyncSettingsTab.vue
src/components/settings/sync-revision-display.ts
```

### src/components/sync

```text
src/components/sync/ForceSyncToggle.vue
src/components/sync/SyncNextTime.vue
src/components/sync/SyncPendingList.vue
src/components/sync/SyncRestoreDialog.vue
src/components/sync/SyncStatusBody.vue
src/components/sync/SyncStatusPanel.vue
src/components/sync/sync-panel-injection.ts
```

### src/components/translation

```text
src/components/translation/TranslatableChips.vue
src/components/translation/TranslatableInput.vue
src/components/translation/translatable.css
```

### src/composables/ai

```text
src/composables/ai/useThinkingTaskCard.ts
```

### src/composables/ai-page

```text
src/composables/ai-page/useAIPage.ts
src/composables/ai-page/useModelConfiguration.ts
```

### src/composables/book-details

```text
src/composables/book-details/chapter-settings-update.ts
src/composables/book-details/useActionInfoToast.ts
src/composables/book-details/useBookDetailsPage.ts
src/composables/book-details/useChapterDragDrop.ts
src/composables/book-details/useChapterExport.ts
src/composables/book-details/useChapterManagement.ts
src/composables/book-details/useChapterTranslation.ts
src/composables/book-details/useChapterVirtualizer.ts
src/composables/book-details/useEditMode.ts
src/composables/book-details/useKeyboardShortcuts.ts
src/composables/book-details/useParagraphNavigation.ts
src/composables/book-details/useParagraphTranslation.ts
src/composables/book-details/useScrollbarDrag.ts
src/composables/book-details/useSearchReplace.ts
```

### src/composables/book-sync

```text
src/composables/book-sync/book-sync-handoff.ts
src/composables/book-sync/book-sync-rules.ts
src/composables/book-sync/useBookSync.ts
```

### src/composables/book-sync-new

```text
src/composables/book-sync-new/useBookSyncNew.ts
```

### src/composables/books-page

```text
src/composables/books-page/useBooksPage.ts
src/composables/books-page/useBooksTabletPage.ts
```

### src/composables/chat

```text
src/composables/chat/constants.ts
src/composables/chat/useChatActionHandler.ts
src/composables/chat/useChatMessageDisplay.ts
src/composables/chat/useChatSending.ts
src/composables/chat/useChatSession.ts
src/composables/chat/useInternalSummarization.ts
src/composables/chat/useMarkdownRenderer.ts
src/composables/chat/usePanelResize.ts
src/composables/chat/useThinkingDisplay.ts
src/composables/chat/useThinkingPhrase.ts
```

### src/composables/dialogs

```text
src/composables/dialogs/useFilePicker.ts
src/composables/dialogs/useUnsavedChangesDialog.ts
```

### src/composables/help-page

```text
src/composables/help-page/useHelpPage.ts
```

### src/composables/import-page

```text
src/composables/import-page/import-action-context.ts
src/composables/import-page/import-action-info.ts
src/composables/import-page/import-action-results.ts
src/composables/import-page/import-batch-description.ts
src/composables/import-page/import-chat-messages.ts
src/composables/import-page/import-draft-windows.ts
src/composables/import-page/import-plan-status.ts
src/composables/import-page/import-recipe-description.ts
src/composables/import-page/import-structure-description.ts
src/composables/import-page/import-workspace-overview.ts
src/composables/import-page/useImportChatPanel.ts
src/composables/import-page/useImportDraftDeletion.ts
src/composables/import-page/useImportNotifications.ts
src/composables/import-page/useImportPage.ts
src/composables/import-page/useImportRouteScope.ts
```

### src/composables/index-page

```text
src/composables/index-page/useIndexPage.ts
```

### src/composables/layout

```text
src/composables/layout/useMainNavDispatch.ts
src/composables/layout/usePopoverBottomSheet.ts
src/composables/layout/useSystemBar.ts
```

### src/composables/main-layout

```text
src/composables/main-layout/useMainLayoutShell.ts
```

### src/composables/novel

```text
src/composables/novel/useEntityListPopover.ts
```

### src/composables/right-panel

```text
src/composables/right-panel/useChatActionPopovers.ts
src/composables/right-panel/useChatComposerState.ts
src/composables/right-panel/useChatMessageListBindings.ts
src/composables/right-panel/useChatPanelBindings.ts
src/composables/right-panel/useChatPanelSetup.ts
src/composables/right-panel/useRightPanel.ts
```

### src/composables/settings

```text
src/composables/settings/useFirecrawlKeySettings.ts
src/composables/settings/useProxySettings.ts
src/composables/settings/useSiteMappingSettings.ts
```

### src/composables/settings-page

```text
src/composables/settings-page/useSettingsPage.ts
```

### src/composables/shared

```text
src/composables/shared/useBookImportActions.ts
```

### src/composables/translation

```text
src/composables/translation/useTermTranslation.ts
```

### src/composables/translation-progress

```text
src/composables/translation-progress/useMobilePanelData.ts
src/composables/translation-progress/useNowClock.ts
src/composables/translation-progress/useStreamVisibility.ts
src/composables/translation-progress/useTranslationProgressPanel.ts
src/composables/translation-progress/useTranslationTodos.ts
```

### src/composables

```text
src/composables/useAutoSync.ts
src/composables/useBookCommitNotifications.ts
src/composables/useChapterCharCount.ts
src/composables/useContextMenuManager.ts
src/composables/useDatabaseBlockedNotice.ts
src/composables/useDesktopUpdates.ts
src/composables/useDeviceVariant.ts
src/composables/useElectron.ts
src/composables/useElectronSettings.ts
src/composables/useForceSync.ts
src/composables/useGistUploadWithConflictCheck.ts
src/composables/useMainNavActive.ts
src/composables/useNovelCharCount.ts
src/composables/useOverlayCloseStack.ts
src/composables/useResponsiveLayout.ts
src/composables/useSyncExecutor.ts
src/composables/useSyncPendingChanges.ts
src/composables/useTabletRightRail.ts
src/composables/useThinkingFormatter.ts
src/composables/useToastHistory.ts
src/composables/useToolbarExpand.ts
src/composables/useUndoRedo.ts
```

### src/constants/ai

```text
src/constants/ai/index.ts
```

### src/constants

```text
src/constants/app.ts
src/constants/chat.ts
src/constants/features.ts
src/constants/proxy.ts
src/constants/responsive.ts
src/constants/version.ts
```

### src/css

```text
src/css/tailwind.css
```

### src/i18n

```text
src/i18n/types.ts
```

### src/i18n/zh-CN

```text
src/i18n/zh-CN/index.ts
```

### src/i18n/zh-TW

```text
src/i18n/zh-TW/index.ts
```

### src/layouts

```text
src/layouts/MainLayout.vue
```

### src/layouts/main-layout

```text
src/layouts/main-layout/MainLayoutDesktop.vue
src/layouts/main-layout/MainLayoutMobile.vue
src/layouts/main-layout/MainLayoutTablet.vue
```

### src/models

```text
src/models/book-sync.ts
src/models/chapter-embedding.ts
src/models/desktop-update.ts
src/models/import-pattern.ts
src/models/import.ts
src/models/manifest.ts
src/models/memory.ts
src/models/novel.ts
src/models/paragraph-search.ts
src/models/settings.ts
src/models/sync.ts
```

### src/pages

```text
src/pages/BookDetailsPage.vue
src/pages/BookSyncNewPage.vue
src/pages/BooksPage.vue
src/pages/ImportPage.vue
src/pages/SettingsPage.vue
```

### src/pages/ai-page

```text
src/pages/ai-page/AIPageDesktop.vue
src/pages/ai-page/AIPageMobile.vue
src/pages/ai-page/AIPageTablet.vue
src/pages/ai-page/AIRoutingPickerDialog.vue
src/pages/ai-page/AIRoutingPickerSheet.vue
```

### src/pages/book-details

```text
src/pages/book-details/BookDetailsDesktop.vue
src/pages/book-details/BookDetailsMobile.vue
src/pages/book-details/BookDetailsMobileOverview.vue
src/pages/book-details/BookDetailsMobileReader.vue
src/pages/book-details/BookDetailsMobileSync.vue
src/pages/book-details/BookDetailsTablet.vue
src/pages/book-details/BookMobileBatchPicker.vue
src/pages/book-details/BookMobileChapterTree.vue
src/pages/book-details/BookMobileHero.vue
src/pages/book-details/BookMobileParagraphList.vue
src/pages/book-details/BookMobileParagraphMeta.vue
src/pages/book-details/BookMobileSegTabs.vue
src/pages/book-details/BookMobileTabContent.vue
src/pages/book-details/BookSidebar.vue
src/pages/book-details/BookSidebarSettingsMenu.vue
```

### src/pages/book-sync-new

```text
src/pages/book-sync-new/BookSyncNewDesktop.vue
src/pages/book-sync-new/BookSyncNewMobile.vue
src/pages/book-sync-new/BookSyncNewTablet.vue
```

### src/pages/books-page

```text
src/pages/books-page/BooksPageDesktop.vue
src/pages/books-page/BooksPageMobile.vue
src/pages/books-page/BooksPageTablet.vue
src/pages/books-page/BooksTabletBookRow.vue
src/pages/books-page/BooksTabletChapterTree.vue
src/pages/books-page/BooksTabletDetail.vue
src/pages/books-page/BooksTabletHero.vue
src/pages/books-page/BooksTabletSideRail.vue
src/pages/books-page/BooksTabletSidebar.vue
src/pages/books-page/BooksTabletStats.vue
```

### src/pages/help-page

```text
src/pages/help-page/HelpDesktopLanding.vue
src/pages/help-page/HelpDesktopNav.vue
src/pages/help-page/HelpMobileDrawers.vue
src/pages/help-page/HelpMobileLanding.vue
src/pages/help-page/HelpPageDesktop.vue
src/pages/help-page/HelpPageMobile.vue
src/pages/help-page/HelpPageTablet.vue
src/pages/help-page/HelpTabletNavList.vue
src/pages/help-page/HelpTabletState.vue
src/pages/help-page/HelpTabletTocList.vue
src/pages/help-page/doc-content.css
```

### src/pages/import-page

```text
src/pages/import-page/ImportPageDesktop.vue
src/pages/import-page/ImportPageMobile.vue
src/pages/import-page/ImportPageTablet.vue
```

### src/pages/index-page

```text
src/pages/index-page/IndexDesktopHero.vue
src/pages/index-page/IndexDesktopRecent.vue
src/pages/index-page/IndexPageDesktop.vue
src/pages/index-page/IndexPageMobile.vue
src/pages/index-page/IndexPageTablet.vue
src/pages/index-page/IndexTabletHero.vue
```

### src/pages/not-found-page

```text
src/pages/not-found-page/NotFoundPageTablet.vue
```

### src/pages/settings-page

```text
src/pages/settings-page/SettingsPageDesktop.vue
src/pages/settings-page/SettingsPageMobile.vue
src/pages/settings-page/SettingsPageTablet.vue
```

### src/router

```text
src/router/index.ts
src/router/routes.ts
```

### src/services/ai

```text
src/services/ai/ai-service-factory.ts
src/services/ai/context/assistant-context.ts
src/services/ai/context/compact-history.ts
src/services/ai/context/context-overflow.ts
src/services/ai/context/measure.ts
src/services/ai/context/plan-compaction.ts
src/services/ai/context/summarize.ts
src/services/ai/context/summary-input.ts
src/services/ai/context/task-context.ts
src/services/ai/core/errors.ts
src/services/ai/core/model-config.ts
src/services/ai/degradation-detector.ts
src/services/ai/index.ts
src/services/ai/model-limits/catalog-types.ts
src/services/ai/providers/ai-sdk/compatible-stream.ts
src/services/ai/providers/ai-sdk/errors.ts
src/services/ai/providers/ai-sdk/messages.ts
src/services/ai/providers/ai-sdk/models.ts
src/services/ai/providers/ai-sdk/request.ts
src/services/ai/providers/ai-sdk/service.ts
src/services/ai/providers/ai-sdk/stream.ts
src/services/ai/tasks/assistant-service.ts
src/services/ai/tasks/config-service.ts
src/services/ai/tasks/explain-service.ts
src/services/ai/tasks/polish-service.ts
src/services/ai/tasks/prompts/assistant.ts
src/services/ai/tasks/prompts/common.ts
src/services/ai/tasks/prompts/explain.ts
src/services/ai/tasks/prompts/index.ts
src/services/ai/tasks/prompts/polish.ts
src/services/ai/tasks/prompts/proofreading.ts
src/services/ai/tasks/prompts/runner.ts
src/services/ai/tasks/prompts/single-paragraph-polish.ts
src/services/ai/tasks/prompts/single-paragraph-proofreading.ts
src/services/ai/tasks/prompts/term-translation.ts
src/services/ai/tasks/prompts/translation.ts
src/services/ai/tasks/proofreading-service.ts
src/services/ai/tasks/term-translation-service.ts
src/services/ai/tasks/translation-service.ts
src/services/ai/tasks/utils/assistant-book-execution.ts
src/services/ai/tasks/utils/assistant-execution.ts
src/services/ai/tasks/utils/chunk-formatter.ts
src/services/ai/tasks/utils/context-builder.ts
src/services/ai/tasks/utils/instrumentation.ts
src/services/ai/tasks/utils/llm-stream-adapter.ts
src/services/ai/tasks/utils/paragraph-task-shared.ts
src/services/ai/tasks/utils/productivity-monitor.ts
src/services/ai/tasks/utils/prompt-policy.ts
src/services/ai/tasks/utils/response-parser.ts
src/services/ai/tasks/utils/single-paragraph-processor.ts
src/services/ai/tasks/utils/state-machine-engine.ts
src/services/ai/tasks/utils/stream-handler.ts
src/services/ai/tasks/utils/task-runner.ts
src/services/ai/tasks/utils/task-types.ts
src/services/ai/tasks/utils/text-task-processor.ts
src/services/ai/tasks/utils/todo-helper.ts
src/services/ai/tasks/utils/todo-workflow.ts
src/services/ai/tasks/utils/tool-dispatcher/handlers/handler-utils.ts
src/services/ai/tasks/utils/tool-dispatcher/index.ts
src/services/ai/tasks/utils/tool-executor.ts
src/services/ai/tools/ask-user-tools.ts
src/services/ai/tools/book-tools.ts
src/services/ai/tools/chapter-scope-helpers.ts
src/services/ai/tools/character-tool-helpers.ts
src/services/ai/tools/character-tools.ts
src/services/ai/tools/help-docs-tools.ts
src/services/ai/tools/index.ts
src/services/ai/tools/memory-helper.ts
src/services/ai/tools/memory-tools.ts
src/services/ai/tools/navigation-tools.ts
src/services/ai/tools/paragraph-tools.ts
src/services/ai/tools/task-status-tools.ts
src/services/ai/tools/terminology-tools.ts
src/services/ai/tools/toast-helper.ts
src/services/ai/tools/todo-list-tools.ts
src/services/ai/tools/tool-call-invoker.ts
src/services/ai/tools/tool-registry.ts
src/services/ai/tools/translation-tools.ts
src/services/ai/tools/types.ts
src/services/ai/tools/web-search-tools.ts
src/services/ai/types/ai-model.ts
src/services/ai/types/ai-service.ts
src/services/ai/types/interfaces.ts
```

### src/services

```text
src/services/ai-model-service.ts
src/services/book-commit-notifications.ts
src/services/book-execution-guard.ts
src/services/book-revision.ts
src/services/book-service.ts
src/services/chapter-content-maintenance.ts
src/services/chapter-content-service.ts
src/services/chapter-embedding-service.ts
src/services/chapter-service.ts
src/services/character-setting-service.ts
src/services/cover-service.ts
src/services/desktop-restart-guard.ts
src/services/embedding-queue.ts
src/services/embedding-service.ts
src/services/full-text-index-service.ts
src/services/gist-sync-incremental.ts
src/services/gist-sync-service.ts
src/services/global-config-cache.ts
src/services/image-upload-service.ts
src/services/library-persistence.ts
src/services/memory-cache.ts
src/services/memory-persistence.ts
src/services/memory-scoring.ts
src/services/memory-service.ts
src/services/proxy-fetch-plan.ts
src/services/proxy-service.ts
src/services/settings-service.ts
src/services/sync-chapter-baselines.ts
src/services/sync-config-persistence.ts
src/services/sync-data-service.ts
src/services/sync-manifest-builder.ts
src/services/terminology-service.ts
src/services/todo-list-service.ts
```

### src/services/book-sync

```text
src/services/book-sync/book-sync-service.ts
src/services/book-sync/changes.ts
src/services/book-sync/errors.ts
src/services/book-sync/normalize.ts
src/services/book-sync/persistence.ts
src/services/book-sync/recipe.ts
src/services/book-sync/remote-chapter-cache.ts
src/services/book-sync/replay.ts
```

### src/services/firecrawl

```text
src/services/firecrawl/firecrawl-client.ts
src/services/firecrawl/firecrawl-errors.ts
src/services/firecrawl/firecrawl-limiter.ts
```

### src/services/import

```text
src/services/import/import-agent-compaction.ts
src/services/import/import-agent-journal.ts
src/services/import/import-agent-prompt.ts
src/services/import/import-agent-service.ts
src/services/import/import-application-persistence.ts
src/services/import/import-application-service.ts
src/services/import/import-batch-runner.ts
src/services/import/import-batch-sources.ts
src/services/import/import-batch-state.ts
src/services/import/import-chapter-batch.ts
src/services/import/import-content-exclusions.ts
src/services/import/import-content-references.ts
src/services/import/import-content-service.ts
src/services/import/import-draft-batch-content.ts
src/services/import/import-draft-batch-selection.ts
src/services/import/import-draft-batch.ts
src/services/import/import-draft-service.ts
src/services/import/import-draft-validation.ts
src/services/import/import-epub-parser.ts
src/services/import/import-error-text.ts
src/services/import/import-expression.ts
src/services/import/import-extraction-service.ts
src/services/import/import-html-parser.ts
src/services/import/import-library-reader.ts
src/services/import/import-library-service.ts
src/services/import/import-metadata-service.ts
src/services/import/import-metadata-validation.ts
src/services/import/import-novel-scope.ts
src/services/import/import-paragraph-matching.ts
src/services/import/import-parsing-client.ts
src/services/import/import-parsing-jobs.ts
src/services/import/import-pattern-job.ts
src/services/import/import-pattern-schema.ts
src/services/import/import-plan-chapters.ts
src/services/import/import-plan-content.ts
src/services/import/import-plan-context.ts
src/services/import/import-plan-layout.ts
src/services/import/import-plan-recipe.ts
src/services/import/import-plan-service.ts
src/services/import/import-preview-service.ts
src/services/import/import-question-service.ts
src/services/import/import-recipe-repair.ts
src/services/import/import-recipe-tool.ts
src/services/import/import-repository.ts
src/services/import/import-source-filter.ts
src/services/import/import-source-service.ts
src/services/import/import-storage-status.ts
src/services/import/import-structure-content.ts
src/services/import/import-structure-parser.ts
src/services/import/import-structure-plan.ts
src/services/import/import-structure-selection.ts
src/services/import/import-structure-tools.ts
src/services/import/import-structure-validation.ts
src/services/import/import-task-naming.ts
src/services/import/import-text-parser.ts
src/services/import/import-text-structure.ts
src/services/import/import-todos.ts
src/services/import/import-tool-arguments.ts
src/services/import/import-tool-definitions.ts
src/services/import/import-tool-executor.ts
src/services/import/import-tool-reads.ts
src/services/import/import-update-recipe.ts
src/services/import/import-work-limits.ts
src/services/import/import-zip.ts
```

### src/services/scraper

```text
src/services/scraper/core/base-scraper.ts
src/services/scraper/core/challenge-detection.ts
src/services/scraper/core/cheerio-text-extract.ts
src/services/scraper/core/page-transport.ts
src/services/scraper/index.ts
src/services/scraper/novel-scraper-factory.ts
src/services/scraper/scrapers/kakuyomu-scraper.ts
src/services/scraper/scrapers/ncode-syosetu-scraper.ts
src/services/scraper/scrapers/novel18-syosetu-scraper.ts
src/services/scraper/scrapers/syosetu-scraper.ts
src/services/scraper/scrapers/syosetu-types.ts
src/services/scraper/types.ts
```

### src/services/settings

```text
src/services/settings/memory-import.ts
src/services/settings/settings-parsers.ts
```

### src/stores

```text
src/stores/ai-models.ts
src/stores/ai-processing.ts
src/stores/ask-user.ts
src/stores/book-details.ts
src/stores/books.ts
src/stores/chat-sessions.ts
src/stores/context.ts
src/stores/cover-history.ts
src/stores/import-workspace.ts
src/stores/settings.ts
src/stores/toast-history.ts
src/stores/ui.ts
```

### src/theme

```text
src/theme/color-tokens.ts
src/theme/tsukuyomi-preset.ts
```

### src/utils

```text
src/utils/abortable-operation.ts
src/utils/action-info-utils.ts
src/utils/ai-context-utils.ts
src/utils/ai-token-utils.ts
src/utils/canonical-json.ts
src/utils/chapter-book-lookup.ts
src/utils/chapter-content-loader.ts
src/utils/chapter-embedding-debouncer.ts
src/utils/chapter-status.ts
src/utils/chapter-structure-hash.ts
src/utils/clipboard.ts
src/utils/complete-idb-transaction.ts
src/utils/compression.ts
src/utils/content-hash.ts
src/utils/context-usage-display.ts
src/utils/cosine-similarity.ts
src/utils/device-orientation.ts
src/utils/dispatch-custom-event.ts
src/utils/domain-utils.ts
src/utils/embedding-text-segments.ts
src/utils/error-message.ts
src/utils/format.ts
src/utils/id-generator.ts
src/utils/import-feedback.ts
src/utils/indexed-db.ts
src/utils/is-cancelled-error.ts
src/utils/local-embedding.ts
src/utils/memory-embedding-lookup.ts
src/utils/novel-form.ts
src/utils/novel-utils.ts
src/utils/platform.ts
src/utils/serialize-dates.ts
src/utils/settings-lookup.ts
src/utils/sync-strip.ts
src/utils/text-matcher.ts
src/utils/text-utils.ts
src/utils/throttle.ts
src/utils/time-utils.ts
src/utils/translation-normalizer.ts
src/utils/translation-updates.ts
src/utils/translation-utils.ts
src/utils/yield.ts
```

### src/utils/action-info

```text
src/utils/action-info/action-field-builders.ts
src/utils/action-info/chapter-location.ts
src/utils/action-info/memory-details.ts
src/utils/action-info/named-entity-details.ts
src/utils/action-info/navigation-and-update-details.ts
src/utils/action-info/read-details.ts
src/utils/action-info/simple-details.ts
src/utils/action-info/translation-details.ts
src/utils/action-info/types.ts
```

### src-electron

```text
src-electron/desktop-update-ipc.ts
src-electron/desktop-updater.ts
src-electron/electron-main.ts
src-electron/electron-preload.ts
src-electron/main-frame-status.ts
src-electron/puppeteer-cookies.ts
src-electron/single-instance.ts
```

## 直接语言数据消费者

### 直接译名字段

```text
src/components/dialogs/CharacterEditDialog.vue
src/components/dialogs/TermEditDialog.vue
src/components/novel/CharacterPopover.vue
src/components/novel/CharacterSettingPanel.vue
src/components/novel/ParagraphCharacterPopoverList.vue
src/components/novel/ParagraphPopovers.vue
src/components/novel/TermPopover.vue
src/components/novel/TerminologyPanel.vue
src/composables/book-details/useActionInfoToast.ts
src/composables/book-details/useChapterManagement.ts
src/composables/chat/useChatActionHandler.ts
src/services/ai/tasks/term-translation-service.ts
src/services/ai/tasks/utils/context-builder.ts
src/services/ai/tools/book-tools.ts
src/services/ai/tools/character-tools.ts
src/services/ai/tools/paragraph-tools.ts
src/services/ai/tools/task-status-tools.ts
src/services/ai/tools/terminology-tools.ts
src/services/chapter-embedding-service.ts
src/services/character-setting-service.ts
src/services/full-text-index-service.ts
src/services/terminology-service.ts
src/utils/action-info/named-entity-details.ts
src/utils/novel-utils.ts
```

### 单语言选用

```text
src/components/dialogs/TranslationHistoryDialog.vue
src/components/novel/ParagraphCard.vue
src/composables/book-details/useBookDetailsPage.ts
src/composables/book-details/useChapterTranslation.ts
src/composables/book-details/useEditMode.ts
src/composables/book-details/useParagraphTranslation.ts
src/composables/book-details/useSearchReplace.ts
src/composables/chat/useChatActionHandler.ts
src/models/novel.ts
src/services/ai/tasks/utils/chunk-formatter.ts
src/services/ai/tasks/utils/context-builder.ts
src/services/ai/tasks/utils/single-paragraph-processor.ts
src/services/ai/tasks/utils/task-runner.ts
src/services/ai/tasks/utils/text-task-processor.ts
src/services/ai/tools/book-tools.ts
src/services/ai/tools/paragraph-tools.ts
src/services/ai/tools/translation-tools.ts
src/services/ai/tools/types.ts
src/services/book-sync/book-sync-service.ts
src/services/chapter-embedding-service.ts
src/services/chapter-service.ts
src/services/full-text-index-service.ts
src/services/import/import-library-reader.ts
src/services/import/import-paragraph-matching.ts
src/services/sync-data-service.ts
src/utils/index.ts
src/utils/novel-utils.ts
src/utils/text-utils.ts
src/utils/translation-utils.ts
```

### 固定语言格式

```text
src/components/ai/ThinkingDetailDialog.vue
src/components/ai/ThinkingReviewedCard.vue
src/components/ai/ThinkingTaskCard.vue
src/components/dialogs/ChapterDateStats.vue
src/components/dialogs/RestoreDeletedItemsDialog.vue
src/components/import/import-labels.ts
src/components/layout/ChatSessionListPopover.vue
src/components/novel/ChapterHeader.vue
src/components/novel/MemoryCard.vue
src/components/novel/MemoryDetailDialog.vue
src/components/novel/MemoryPanel.vue
src/components/novel/MemoryReferencePanel.vue
src/components/settings/ApiKeysSettingsTab.vue
src/components/settings/SyncRevisionCard.vue
src/components/settings/SyncSettingsTab.vue
src/components/settings/sync-revision-display.ts
src/composables/books-page/useBooksPage.ts
src/composables/import-page/useImportChatPanel.ts
src/composables/right-panel/useRightPanel.ts
src/composables/useToastHistory.ts
src/services/ai/tasks/prompts/assistant.ts
src/utils/action-info-utils.ts
src/utils/context-usage-display.ts
src/utils/format.ts
```

### 写入规范化

```text
src/services/ai/tools/character-tool-helpers.ts
src/services/ai/tools/character-tools.ts
src/services/ai/tools/terminology-tools.ts
src/services/character-setting-service.ts
src/services/terminology-service.ts
src/utils/translation-normalizer.ts
```

## 帮助指南清单

- public/help/ai-models-guide.md
- public/help/book-details-chapters.md
- public/help/book-details-characters.md
- public/help/book-details-editing.md
- public/help/book-details-memory.md
- public/help/book-details-overview.md
- public/help/book-details-terminology.md
- public/help/book-details-translation.md
- public/help/books-page-guide.md
- public/help/chat-assistant-guide.md
- public/help/front-page.md
- public/help/import-guide.md
- public/help/library-guide.md
- public/help/local-embedding.md
- public/help/settings-guide.md
- public/help/toolbar-guide.md

## 语言基础阶段验证

- 系统语言选择、显式服务翻译、资源校验、偏好持久化/同步、保存失败/并发、启动 hydration 和框架联动已做失败测试后实现。
- 全量覆盖率回归：278 个文件通过、1 个跳过；3043 项通过、5 项跳过（Electron 本地化接线前的一次完整运行）。
- Electron IPC/动态更新说明针对性回归：17 项通过；SPA 与 Electron --skip-pkg 构建通过。
- 浏览器实际检查：英文通用设置切换繁中，桌面/平板/手机断点切换后当前标签和语言保持，控件可用。其他页面仍待任务 10 迁移，不据此宣称全站已本地化。
- 浏览器检查发现初始 HTML 仍显示中文加载文案，已改为无文字动画，确保读取偏好前不闪现错误语言。

## 同步与恢复阶段记录（2026-09-29）

- 段落选用按语言槽的逻辑版本合并；术语、角色、别名按稳定 ID 与字段版本合并，删除优先。相同原文的卷章标题合并各语言槽。
- 本地 IndexedDB 增加 `sync-metadata` 与 `entity-operations`；版本先预留，业务失败不复用，接收书籍与正文时推进已观察版本。设备分配记录不进入书籍同步/备份。
- 实体表单修改在最新数据上应用字段差异。删除与 tombstone 原子写入；旧书籍副本的普通保存保留已知删除记录。
- 单个实体撤销、批量实体导入撤销、书库备份覆盖、Gist 修订恢复和 importer 整次撤销使用固定操作回执与新身份。成功请求重放不覆盖后续编辑；旧内嵌正文的物理布局保留。
- 表单撤销只覆盖这次表单修改的字段，避免撤回范围外译文与实体。
- 最近完整检查：Vitest 291 个文件通过、1 个跳过；3097 项通过、5 项跳过。lint、type-check、quality-check 全部通过，Fallow diff 门禁无新增死代码、重复和健康度问题。
- 仍待接入：强制推送的实体协议、manifest v4 迁移；设置导入各存储的统一失败回滚；后续阅读/AI/检索/文案/帮助指南迁移。当前阶段不能作为完整多语言功能验收。

## v4 发布与设置回滚阶段记录（2026-09-29）

- manifest 升至 v4。旧版本/未知版本不发送条件 ETag；协议升级无视已知 hash 读取所需条目，并以一次 PATCH 发布全部迁移文件与新 manifest。普通同版本增量同步保留分批行为。
- 普通、强制、旧上传/下载、修订恢复及伪 CAS 的 manifest 读取共用版本门禁；未来书籍实体版本整体中止，不能进入旧布局重建。读取或应用必需条目失败不发布新协议。
- 强制模式持久化操作身份，失败沿用映射与版本。协议提交校验最新原文与元数据，失败原子回滚。旧执行的完成回调不能关闭后来开启的新操作。
- 设置导入由 SPA / Electron 共用入口；失败恢复原实体身份、全部语言、设置/同步配置及记忆向量，保留设备计数，重试沿用已分配身份。
- 三语言设置 JSON 解析与书籍/术语/正文往返已验证；设备分配记录和操作表不进入导出。
- 上线限制：参与同步的所有设备应先升级到支持 v4 的版本。已发布旧版的强制推送绕过协议检查，无法由新客户端远程修补，因此不能混用旧版强制写入。
- 本阶段完整回归：3120 项通过、5 项跳过；随后新增三语言往返用例通过。lint、type-check、quality-check 通过；Fallow diff 门禁无新增问题。
- 仍未完成：原文编辑全路径的最终复核（4.5）、别名/按名导入的完整身份审计（5.5）、阅读/AI/检索/UI/16 篇帮助指南与最终旅程验收（6–12）。

## 阅读与编辑阶段记录（2026-09-29）

- 完成 4.5：普通原文编辑复用明确原文匹配，插入和移动不按下标移植译文；原文修订清空全部语言。普通章节更新、合并/替换、懒加载批量更新、配方更新、移动和删除的相关回归通过。
- 完成 6.1：共享阅读卡片、预览入口、卷章标题及三设备章节列表按书籍目标语言读取；缺失时回退原文，标题原文不执行译文格式化。
- 完成 6.5：txt、json、剪贴板与双语导出使用目标选用及原文回退；英文标点保持，简繁规范化回归通过。
- 6.3 已接通 UI 完成度、未翻译筛选及润色/校对前置判断；直接 AI 服务入口仍待执行语言快照接线，因此尚未标记完成。
- 6.4 已接通手动译文编辑、语言历史选择、搜索替换、复制读取。编辑事务重读最新正文，保留其他语言及范围外变更；语言/原文过期和后续项失败均不部分提交。历史展示语言并禁止跨语言选用，虚拟滚动草稿按语言区分。撤销重做仍待接通，尚未标记完成。
- 6.2 已接通术语/角色/别名的服务写入、面板、弹窗及悬浮卡：英文标点保留，空译名不回填原名，省略字段保留现值；弹窗捕获打开语言，持久化也检查 UI 语言目标是否过期。显式执行语言允许旧任务保存原语言而保留最新书籍目标。实体文件导入与全部工具写入仍待审计，尚未标记完成。
- 新建别名使用 UUID，改名保留 ID；5.5 的批量导入身份处理仍未完成。
- 阅读阶段完整回归 3141 项通过、5 项跳过，lint/type-check/quality-check 通过。随后译名阶段完整回归 3149 项通过、5 项跳过；共享语言编辑保护与服务加载入口提取后，Fallow diff 门禁无新增问题。后续检查继续记录，当前不能作为全功能验收。

## 译名与实体导入阶段收尾（2026-09-29）

- 完成 5.5 / 6.2。实体文件导入保留所有语言、稳定 ID 和缺席语言；旧文件归简中，只有旧格式且名字唯一时才兼容按名解析。同名现代新 ID 保持独立，面板显示名称冲突。
- 旧重复别名先稳定归并再绑定已有身份，数组反转不改变结果；冲突标记保留。输入多项解析到同一目标、重复 ID 或损坏语言数据时整批拒绝。文件中已观察版本参与本地计数分配。
- AI 别名 ID 改名和歧义拒绝已通过实际 handler 回归；同名不同角色 ID 的按名查询拒绝歧义。别名编辑框显示稳定 ID。
- 面板、弹窗、悬浮卡、CRUD 与文件导入导出已接入目标语言和语言槽；编辑期间目标变化有 UI 提示和持久化门禁，显式执行语言写入保留最新书籍目标。
- 完整回归：303 个文件通过、1 个跳过；3158 项通过、5 项跳过。lint/type-check/quality-check 通过，Fallow diff 门禁无新增问题。
- 尚未完成：6.3 的直接 AI 入口、6.4 的撤销重做，以及 AI 语言快照/工具/提示词、检索隔离、UI 文案、16 篇三语言指南和集成验收。当前进度 29/60，不作为全功能完成。

## 撤销与执行语言基础进展（2026-09-29）

- 段落手动编辑和搜索替换的历史记录携带原操作语言及章节范围。撤销/重做恢复该语言的版本和选用，保留其他语言与最新书籍目标；恢复分配新选用版本。存储恢复失败不弹出历史项，可继续重试。
- 字符串卷章标题原文不变时保留全部语言槽；原文变更时清空旧标题译文，避免复用旧原文译名。原文/标题相关回归通过。
- 新增无 Vue/Pinia 依赖的不可变 ExecutionLanguages 快照。单段处理在首次 await 前复制快照，目标缺少选用时拒绝润色/校对；模型边界回归验证更改 options 不改变该执行的参考译文。
- 6.4 仍未标记完成：卷章译名编辑表单的目标语言写入与范围恢复尚需接线。7.1 / 7.2 仍未标记完成：全部 UI/服务入口、runner、工具及 importer checkpoint 尚未完整贯穿快照，默认旧调用保留简中语义。不要据此宣称 AI 已全面支持三语言。
- 最新完整回归：307 个文件通过、1 个跳过；3166 项通过、5 项跳过。lint/type-check/quality-check 通过；Fallow diff 门禁无新增死代码、重复或健康度问题。
- 当前完整任务进度 29/60。本轮未创建代码提交；现有提交仍为 230dd2fb。

## 标题编辑、批次保存与执行入口（2026-09-29）

- 本地阶段提交为 `45c9f37b`，未推送。提交后继续的本节改动尚未提交；历史阶段记录保留其当时状态。
- 6.3 完成：页面完成度、未翻译批次、单段/批次润色与校对服务使用执行目标语言；目标缺少选用时不借用其他语言版本。
- 6.4 完成：卷章标题编辑捕获目标语言与原始标题，事务重读最新书籍，保留其他语言和范围外 metadata；撤销恢复操作语言并分配新版本。章节移动和仅修改过的设置字段一起提交，不回存正文快照。段落历史、手动编辑、搜索替换与撤销重做维持此前接线。
- 正文七个 UI 入口在首次异步读库之前冻结 `{ uiLocale, targetLanguage }`。测试先复现等待刷新期间切设置导致任务语言改变，再验证七入口都沿用原语言。每批结果合并最新正文，任务收尾不再保存整章旧快照；逐批保存、取消期间持锁、切章卸载与并发章节保存六项实际书库回归通过。
- 7.1 完成：普通助手、正文翻译/润色/校对、术语控件、解释入口和 importer（含配方修复任务）均捕获执行语言。两个并发助手请求独立，运行中切设置不改变旧请求工具上下文；无书籍助手和可翻译控件使用启动界面语言为目标。
- Importer 检查点只记录 `uiLocale`，旧检查点归简中；关闭并重新打开 IndexedDB、重建 Pinia 后，续跑仍使用原 UI 语言。目标语言不存进 importer 检查点，新书真正创建时的语言规则保持原事务实现。
- 术语 prompt 与 JSON 重试提示已有简中/繁中/英文资源，并移除日语来源限制；相关术语、角色和别名只投影执行目标译名。解释输入使用界面语言，原样保留任意语言选中文本。其余 AI prompt、工具描述/反馈、todo、上下文与缓存、UI 文案和指南尚未全面迁移，7.2–7.4、8–12 继续保持未完成。
- 本阶段全量回归：319 个文件通过、1 个跳过；3197 项通过、5 项跳过。新增解释模板三语言回归另行通过。lint、type-check、三语言资源检查及 quality-check 通过；Fallow diff 无新增死代码、重复和健康度问题。
- 当前完整任务进度 32/60。

## 译名与段落工具的语言写入（2026-09-29）

- 8.8 完成：术语/角色工具不再提前执行中文标点转换；别名 helper 按执行目标规范化。英文 `Dr. Smith`、ASCII 引号和句点在手动服务、AI 工具和数据库重载后保留，简中/繁中工具仍执行既有中文引号规范化。显式空字符串可清空目标译名；空白垃圾输入仍拒绝，省略字段保留现值。
- 术语/角色/别名创建和更新都传入宿主捕获语言。模型参数不能改写目标槽，晚到结果保留最新书籍目标及其他语言值。工具响应读取事务提交后的实体；查询、列表和关键词搜索只暴露目标译名，缺失译名为空，不跨语言扩展译名搜索。
- `select_translation` / `update_translation` / `remove_translation` 校验执行目标和版本 ID，使用正文编辑事务；新增译文也按执行语言合并最新正文。删除最后一个目标版本不会选用其他语言。新增历史保持每语言五个版本，非选用追加保留旧选用，逐出后切到新版本；导入较长历史后的同文复用仍保留选用 ID。
- 7.3 仍未完成：批量替换、独立章节标题工具等剩余读写及回调失败传播尚需接线；7.2 的压缩/状态反馈与 7.4 的工具资源仍待迁移。当前阶段不代表 AI 工具和提示词已全面本地化。
- 最新完整回归：322 个文件通过、1 个跳过；3214 项通过、5 项跳过。lint、type-check、quality-check 全部通过，三语言资源检查通过；Fallow diff 没有新增死代码、重复或健康度问题。
- 当前完整任务进度 33/60。本节及上一节实现尚未再次提交，最近本地提交仍为 `45c9f37b`。

## 所有 AI 保存入口与操作撤销收尾（2026-09-29）

- 7.3 完成：独立章节标题工具使用标题事务，响应按执行目标读取；原始标题字符串不等同于目标译文，空标题不增加翻译要求。复核门禁和数据库交叉检查只认执行语言的选用与标题，不把其他语言数据计为已完成。
- 批量替换只修改执行语言的选用版本，兼容 `replace_all_translations` 字段不再扩大历史写入范围。索引及线性候选共同验证目标语言；整批跨章节编辑在同一事务验证原文和选用，任何后续项失败均回滚，空输入不更新书籍，损坏数据和重复章节拒绝。
- 标题与段落回调失败会终止执行并向上抛出，不再继续请求模型或报告完成。工具轮次立即交付标题回调；处理完成标记在保存回调成功后更新。
- 操作回执绑定不可变书籍/执行语言，工具或调用方后续修改不能覆盖该范围。聊天单段及批量撤销按原书原语言编辑最新正文，保留后来其他语言和目标；译名更新撤销只恢复实际改动的字段，保留原身份与后来其他语言/未改字段。明确撤销别名删除分配按操作固定的新身份，重试不增殖；更新撤销不能复活后来已删除的实体。
- 完整回归：328 个文件通过、1 个跳过；3236 项通过、5 项跳过。lint/type-check/三语言资源检查通过；quality-check 通过，Fallow diff 无新增死代码、重复或健康度问题。`booksStore.restoreEntity` 的 helper 参数调用为经引用核验的误报，使用声明旁单数规则行内抑制，未修改根符号白名单。
- 当前完整任务进度 34/60。7.2、7.4、AI 剩余模板/资源、检索语言隔离、全站 UI 与 16 篇三语言指南、集成与构建验收仍未完成。本阶段未追加提交，最近提交仍为 `45c9f37b`。

## AI 交互资源与结构化 todo 进展（2026-09-29）

- 普通助手系统指令、简繁月詠人格、英文中性表达、目标语言独立声明、摘要/历史摘要隔离、压缩错误与续跑提示已接入三语言资源。语言选择器保留原生名称，AI 指令使用执行语言中的语言名称；英文交互/繁中目标模型边界回归通过。
- 摘要请求及分段预算使用捕获的 uiLocale，运行中切 UI 不改变后续摘要段；普通助手自动压缩与 importer 手动压缩传入同一执行/检查点语言。原文、用户约束、问答、标识和摘要防注入要求保留。既有网络 fixture 改为按单条 user 请求结构区分摘要，避免依赖简中标题。
- TodoWorkflow 接收结构化段落原文、ID 和展示序号，不再从“原文:”标签解析预览。新 todo 持久化 uiLocale 与 paragraphInputs，状态更新保留它们。规划/复核/批次说明、上下文清单和 reminder 已有三语言；恢复不重建历史 todo，gate 仅依据状态。
- 每个 task loop 使用独立 locale 的 PromptPolicy，预定义状态与循环提醒使用执行语言。普通助手 todo 创建记录上下文语言，原有自由文本不被翻译。
- 本阶段完整回归：331 个文件通过、1 个跳过；3239 项通过、5 项跳过。lint/type-check/check:i18n/quality-check 通过；Fallow diff 无新增问题。
- 任务 7.2 / 8.1 / 8.5 暂不新增完成标记：剩余反馈与 fallback、retry/state 的直接字符串需要最终覆盖复核，不能按局部资源迁移推断全链路已完成。7.4、8.2–8.4、8.6–8.7、9–12 的完整工作仍在活动目标范围内。此阶段未提交，当前总进度仍为 34/60。

## Unicode 原文与目标语言校验阶段（2026-09-29）

- 纯符号判断使用 Unicode 字母和数字类别，阿拉伯文、泰文、西里尔文、带重音字母和补充平面汉字不再误判为装饰段落；正文翻译服务入口回归验证任意语言原文可抵达模型。
- 全词查找与替换按 Unicode 字母、数字及组合标记识别边界，混合汉字上下文不再使非汉字关键词退化成部分匹配，既有汉字邻接行为保留。
- 英文目标允许成对 ASCII 双引号；共享引号配额只使用一次，先满足候选类型受限的规则，防止漏对白或误拒弯单/双引号组合。无对白原文的英文英寸符号与原样提交可通过；简繁保留既有引号规则。原文前缀验证仍在接受原样提交之前执行。
- 重复当前选用译文与历史译文均可计为已处理；原样提交使用三语言中性反馈，英文长度比例告警独立于简繁。
- 本阶段保持 34/60：关键词提取的全部调用路径、完整 AI 模板和工具反馈、真实模型试译等验收尚未完成，未按局部回归勾选 8.6 / 8.7。此次提交为阶段检查点，完整实施目标继续保持活动状态。
- 提交前完整回归：334 个文件通过、1 个跳过；3272 项通过、5 项跳过。规范和规格两轴审查发现的引号问题均先补失败回归再修复，复查在本次提交范围内无剩余发现。
- lint、type-check、Prettier、三语言资源检查及 quality-check 通过。引号计数拆分后复杂度门禁通过，Fallow CI diff 的死代码、重复与健康度新增问题均为 0。

## 正文 AI 模板与自动参考内容（2026-09-29）

- 最近本地提交为 `066bc578`，未推送。本节在该提交后继续实现，尚未再次提交。
- 8.1 完成：普通助手空回复、完成、取消、未知错误与宿主工具拒绝反馈接入三语言；越权、缺书籍及工具轮次上限采用固定错误码，取消使用 AbortError 身份判断，保留第三方诊断原文。此前助手人格、解释与摘要防注入回归继续通过。
- 8.2 完成：翻译、润色、校对、单段处理和共享准确性、符号、敬语、数据维护、记忆及输出协议使用三语言资源；执行 UI 与目标独立传至所有正文 prompt。原文逐段识别、同目标原样提交、简繁区分和混合内容部分转换明确写入规则，日语敬语只对对应片段适用。英文目标不要求中文标点。
- JSON 协议示例经参数插入，三 UI 语言验证 status、paragraph_id、original_text_prefix、translated_text 和章节标题字段保持不变；原文前缀开关、批次上限、维护阶段、paragraph_id 禁止使用 index、第一块标题工具与单段禁止写角色/术语等约束保留。术语有书籍请求补齐书籍、章节及特殊指令标签的 locale，用户原文不被转换。
- 分块首块/后续块、段落数量、维护提醒与前后文标签使用执行 UI。单段前后文选用目标译文；单段及批次术语/角色/别名只读取目标槽，缺失留空，描述和说话风格保留原文；章节语义参考只组合原始标题和目标标题，记忆正文共享。完整查询工具、检索索引与缓存仍属于未完成 9.1–9.3。
- 8.5 经复核完成：结构化原文贯穿 processor、runner、TodoWorkflow，执行语言和段落输入持久化，恢复不重复生成，gate 依赖状态，每轮使用同一语言快照刷新 todo 清单与提醒。
- 新增正文真实模型入口回归、三语言 JSON 协议回归及实体参考回归；实体夹具使用真实书库明确简中历史写入，再以独立英文执行验证，旧兼容字段读取可复现两项失败，修复后通过。两轴审查发现的单段实体及术语标签接线遗漏均已修复并复查。
- 当前进度 37/60。7.2 / 7.4、8.3 / 8.4 / 8.6 / 8.7、9–12 仍在完整活动目标范围内，未按本阶段模板迁移推断全应用已完成。
- 本轮最终全量回归：336 个文件通过、1 个跳过；3302 项通过、5 项跳过。lint、type-check、三语言资源 key/参数/编译及 Prettier 检查通过；共享记忆格式化消除重复后 quality-check 通过，Fallow CI diff 死代码、重复及健康度新增问题均为 0。审查在本次实施范围内无剩余发现，尚未开始整个 change 的最终完成审计。

## 普通与导入工具声明本地化（2026-09-29）

- 58 个普通注册工具的全部描述及嵌套参数已移入三语言资源，共 229 项（包含原文前缀启用/禁用两分支）；32 个导入工具的 113 项描述使用独立命名空间，同名书籍/章节/问答工具不会借用普通助手的权限说明。
- 默认简中声明仍兼容原调用；按执行 UI 语言递归克隆和冻结声明，不修改共享数组内的原对象，名称、类型、参数、枚举、required、分页和权限过滤保持不变。批次校验与描述共享唯一上限常量，JSON/正则/花括号/竖线等描述用消息字面量转义，缺少对应资源时明确拒绝而不回退借用简中。
- 普通助手、批次与单段处理以及导入执行均传入捕获 UI 语言。实际模型入口验证英文描述；导入关闭数据库并切为繁中后恢复，声明仍是检查点英文。导入预览明确不应用书库，同名 get_book_info 不附带凭据或记忆，参数和来源范围控制不因语言改变。
- 公共工具未知名称、截断与无法解析参数反馈接入三语言，固定 error_code 不依赖说明字符串；截断在 handler 前拒绝，已知第三方 Error 诊断保留原文。
- 资源迁移后显露的字符串参数及工具声明外壳重复已提取共享函数，未修改业务处理逻辑。两轴审查在本次声明及公共反馈范围内无剩余发现。
- 7.4 / 8.3 / 8.4 保持未完成：各业务工具的自然语言返回、服务错误与 importer prompt/问题/状态/配方重试仍须迁移，不以声明全集覆盖推断反馈已全面本地化。当前完整进度仍为 37/60，本阶段尚未提交。
- 本阶段最终回归：338 个文件通过、1 个跳过；3308 项通过、5 项跳过。lint、type-check、资源 key/参数/编译、格式和 quality-check 全部通过；Fallow CI diff 死代码、重复、健康度问题均为 0。

## Importer 主模板及核心执行反馈（2026-09-29）

- 原主模板的 16 条工作规则提供简中、繁中、英文版本，按冻结 UI 语言装配简繁人格或中性英文。来源/工具结果与历史摘要作为数据，不提升为指令；任务名称、元信息、摘要、失效原因与 JSON 快照参数原样保留。匹配协议花括号/竖线使用字面量转义，UTF-16、500 章/项、3 路提取、20% 固定章节、自测、来源不扩大及最终 UI 确认约束保留。
- 新请求和重启恢复均将原检查点 UI 语言传到主 prompt，默认续跑指令也沿用该语言；旧检查点保持简中。恢复中断、上下文/工具限额、启动锁/模型/必要选择错误与压缩反馈迁入资源，固定 code 前缀与状态迁移不变。
- 必要小说选择问题使用检查点语言，候选原始名称不转换。配方修复任务命名捕获点击界面语言，预填说明按打开工作台的 UI 语言生成，保留书名与失败原因；已有输入与历史消息不重译，不替用户发送或启动 Agent。
- 新增模板三语言数据边界、重启续跑、状态错误、配方名称/预填、小说选择和限额反馈回归；有效失败先确认后修复。相关 5 文件 44 项回归通过，lint、type-check 和三语言资源编译检查通过。
- 8.4 尚未勾选：业务执行器及底层服务错误、配方自测 issues 和部分问题回答错误仍须本地化，不能只凭主模板完成判定 importer 全链路完成。7.2 / 7.4 / 8.3 与其余 9–12 继续保持完整任务范围，进度仍为 37/60，改动未提交。
- 本轮最终回归：339 个文件通过、1 个跳过；3318 项通过、5 项跳过。lint、type-check、资源编译、格式与 quality-check 全部通过；Fallow CI diff 死代码、重复及健康度新增问题均为 0。两轴审查在本轮模板及核心执行反馈范围内无剩余发现。

## 实体、记忆、导航、问答与待办工具反馈（2026-09-29）

- 术语、角色、记忆、导航、问答和待办六类工具的自有成功、未匹配、校验、批量及自动推进说明迁入三语言资源，handler 在异步操作前捕获 UI 语言，helper 显式接收同一值。协议字段、枚举、ID 与业务处理保持不变；用户名称、描述、问题/答案、todo 与 memory 文本作为参数原样保留。
- 新增 `LocalizedError` 将稳定 code、资源 key 与参数分离，默认简中保持旧服务使用方式；工具边界按执行 UI 渲染已标识的自有错误。术语、角色、记忆和 todo 服务错误同步迁移，第三方 Error、字符串及对象诊断通过原安全格式化器保持原文，不按说明文字猜测错误身份。
- 术语/角色无精确或模糊匹配时补充固定 `TERM_NOT_FOUND` / `CHARACTER_NOT_FOUND`，三语言码相同且包含花括号/竖线的用户名称原样。旧歧义测试改检查 `code`，继续验证按 ID 编辑与歧义拒绝，未改变实体身份及撤销协议。
- 回归覆盖三语言错误码、简繁/英文成功反馈、实际记忆入库、用户文本插值、第三方诊断、待办自动推进及服务错误；各族有效失败先复现再修复。两轴审查发现的未匹配缺码已修复并复查，本轮范围无剩余发现。
- 8.3 / 7.4 保持未完成：书籍、段落、批次译文、任务状态、网络、帮助工具与 importer 业务返回仍有待迁移。当前完整进度仍为 37/60，尚未新增本地提交。
- 2026-09-30 补充：质量门禁显露的共用声明、书籍上下文、模糊结果、错误 JSON、角色/记忆/段落读取前置及 todo 索引校验已提取，未使用抑制或根白名单。完整参数 schema、部分失败、动作派发及事务顺序保留；注册全集协议回归继续通过。
- 最终回归：340 个文件通过、1 个跳过；3331 项通过、5 项跳过。lint、type-check、三语言资源编译、Prettier 与 quality-check 全部通过；Fallow CI diff 死代码、重复及健康度新增问题均为 0。
- 共享 helper 重构后两轴再次复核，无剩余发现；规格复查另跑相关 7 文件 137 项回归通过。本结果仅覆盖本次工具/服务反馈及重构，完整 change 的剩余 23 项和最终审计继续保持活动状态。

## 书籍、段落查询与任务状态阶段检查点（2026-09-30）

- 书籍、卷章、相邻章节、分页段落和翻译历史按执行目标语言读取标题、正文、选中译文及计数；缺目标段落译文不借用简中版本。章节显示标题支持显式执行目标，默认调用仍沿用书籍目标。
- 书籍工具与任务状态的主要自有反馈迁入三语言资源，并使用稳定错误码。补充真实书库查询和状态转换回归；旧英文标题门禁测试改为检查固定错误码及英文说明，门禁行为保持不变。
- 本次按用户要求提交当前阶段。最新两轴审查仍有三项待修：卷章摘要缺目标标题时 JSON 会省略 translation 字段；段落读取包装器及 review 校验在首次等待后读取目标语言，需提前捕获快照；缺失段落超过 10 个时说明尾缀仍为中文。
- 以上问题保留为后续 TDD 修复工作。7.4 / 8.3 / 9.1 未勾选，完整进度仍为 37/60；本提交不代表整个 change 已完成或最终审查无发现。
- 提交前全量回归：342 个文件通过、1 个跳过；3344 项通过、5 项跳过。lint、type-check、三语言资源检查、格式及 diff 检查通过。quality-check 未通过：CI diff 门禁发现 5 组重复与 2 处 CRAP / 覆盖率问题，位于 book-tools 与 paragraph-tools；待后续修复，不标记质量门禁通过。

## 审查修复、查询隔离与 Unicode 检索（2026-09-30）

- 最近本地提交 `afa56017`，未推送。本节为提交后继续实施的未提交改动；上一阶段提交是有效进展，不作为全 change 完成。
- 三项审查问题已先复现再修复：卷章摘要缺目标标题时保留空 translation 字段；段落读取包装器及 review 完整性校验在首次等待前固定目标语言；超过 10 个缺失段落 ID 的说明尾缀提供三语言版本。等待中替换上下文的回归使用真实数据库/段落定位边界，任务门禁保持原规则。
- 正则及关键词工具只匹配执行目标选用；缺目标译文不作为空串参与正则匹配，不借用其他语言完成度。未传语言的旧正则调用保留原空选用回退语义。原文与译文关键词取交集的索引和线性路径在最终限额前过滤，后续有效候选不会被早期其他语言候选截断。
- 全文索引查询新增显式执行语言及交集过滤参数；本阶段只完成查询结果边界。持久索引文档语言标记、标题/别名及章节向量语言签名、目标变化失效与过时提交拒绝仍属 9.2，未勾选 9.1 / 9.2 / 9.3。
- 8.6 完成：Unicode 文字不再被符号过滤器跳过，实际翻译请求覆盖阿拉伯文、泰文、西里尔文、重音字母及扩展汉字；记忆评分保留完整 Unicode 语义单元、CJK 与章节序号分组，实际记忆检索覆盖组合重音及 NFD 日语浊音/半浊音。段落关键词截取按码点和后续组合符分组，保留代理对与组合文字；完整词替换边界及纯装饰/孤立组合符过滤回归通过。
- 抽取实际共用的书籍参数/语言捕获、读取动作与段落查询响应，消除上一提交的 5 组重复；新增实际书籍元信息更新及正则查询回归后，2 处 CRAP / 覆盖率问题消除。未添加抑制或根白名单。
- 两轴审查发现的正则空匹配、旧空选用回退、AND 候选早截断及 NFD 浊音问题均有有效失败回归，再修复及复查。本轮范围无剩余发现；完整 change 尚余 22 项，进度 38/60，保持活动状态。
- 最终全量回归：343 个文件通过、1 个跳过；3372 项通过、5 项跳过。lint、type-check、三语言 key/参数/编译检查、Prettier 与 quality-check 通过；CI diff 门禁死代码、重复及健康度新增问题均为 0。新增查询过滤提升复杂度后将实际共用的当前段落过滤移入独立函数，未改变过滤/分页顺序，再次验证通过。本阶段未提交。

## 章节向量、全文索引与执行别名（2026-09-30）

- 9.2 完成：正文向量输入只拼接原文与目标选用；标题输入包含原始及目标标题，查询显示标题/卷标题与别名索引使用执行目标。每章缓存记录目标语言及实际输入 SHA-256 签名；旧无签名缓存视为过期，后台扫描也核验当前输入与语言。
- 嵌入读取书籍和正文的同一数据库快照，事务外计算向量和签名；写入在 books / chapter-contents / chapter-embeddings 同一事务内重新核验输入，旧目标、正文变化或章节删除后的结果丢弃。派生维护只删除失效缓存，不误删已按当前输入重建的缓存。
- 目标变更由 canonical LibraryPersistence 保存入口返回全部章节维护范围，使全文索引失效并经既有 dirty / queue 路径后台重建，保留共享记忆及向量。新增实际保存回归，覆盖元数据保存不带正文时的目标切换。
- 全文持久索引 schema 2 保存按语言标记的选用译文、标题及输入签名，旧索引重建；搜索在 Fuse 候选排序前按目标投影，onlyWithTranslation 只认该目标选用。构建从数据库快照读取，持久提交及内存发布均核验书籍修改序号和目标；旧构建和旧持久加载晚返回均拒绝覆盖新缓存。
- 章节查询向量完成后，书籍、正文输入和缓存行来自同一只读事务，标题/别名排名与已核验向量一致。有效内容暂无缓存时明确返回 CHAPTER_CACHE_REBUILDING；真正空章仍返回空匹配。原排名公式和模型保留。
- MemoryService 的别名扩展接收显式执行目标；search_memories 与书籍、段落、术语、角色的关联记忆查询贯穿同一值。真实英文执行、书籍当前简中的回归验证英文译名命中，不借用简中扩展；记忆正文仍为共享原文。实体工具在等待前捕获目标，旧函数调用保留可选参数兼容。
- 两轴审查发现的旧持久索引加载晚发布、空缓存成功返回及等待前旧标题/别名问题均已先复现再修复并复查，无剩余发现。质量门禁显露的三组索引身份读取/校验重复已提取，事务顺序保留，未增加抑制或根白名单。
- 当前进度 39/60，9.1 的全消费者终审和 9.3 的记忆预览/评分一致性仍未完成；其余 AI 自有反馈、全站 UI、16 篇三语言指南和最终旅程/构建验收继续推进。本阶段未提交，最近提交仍为 afa56017。
- 全量回归：346 个文件通过、1 个跳过；3394 项通过、5 项跳过。lint、type-check、三语言资源及格式检查通过；旧关联记忆四参数断言已显式增加默认简中目标。最后一组上下文重复通过既有 checkedToolBookContext 统一捕获目标消除，相关 15 项回归通过。共享记忆回归另使用实际 updateMemoryEmbeddingOnly 写入向量及模型版本，确认切目标后逐字段保持。
- 最终 quality-check 通过：CI diff 门禁死代码、重复及健康度新增问题均为 0；源码、格式及差异检查通过。整体目标仍有 21 项待实施/验收，未归档或宣称整个 change 已完成。

## 记忆预览、上下文终审与网页反馈（2026-09-30）

- 9.1 完成：上下文、前后文、卷章/段落/历史查询以及实体精确、模糊、关键词和列表分支按执行目标投影。新增 16 项实体查询行为审计，覆盖英文成果与缺失繁中成果，译名缺失留空，用户描述和说话风格保留原文。旧字段扫描中 translation-action-restore 的旧操作回执兼容回退不属于自动参考读取；出现次数查询仅统计原文关键词。
- 9.3 完成：用于记忆评分的术语、角色和别名原名/目标译名在首个等待前固定，实际注入明确传目标语言。页面预览提取到三变体共用的 useMemoryReferences，使用相同章节语义查询与评分入口；目标、章、同长度正文、标题及实体名称输入变化即废弃旧请求并刷新，防抖等待或卸载后晚返回不能覆盖当前 refs 或加载状态。
- 预览选择不发布执行评分旁路，只有实际注入发布本次 breakdowns；空结果或失败清理旧评分，旧预览晚返回不会污染翻译记录的引用。评分失败时预览与注入统一回退最近 15 条，且不更新访问时间或书籍修改序号。相关问题均先以有效失败回归复现，再修复及两轴复查。
- 普通 search_web / fetch_webpage 自有必填、URL、配置、鉴权、空提取、Firecrawl 额度/限速/目标站/空内容/HTTP 失败说明迁入简中、繁中、英文资源，补固定 error_code。执行 UI 在等待初始化前捕获，query、URL、来源标题/正文及外部诊断原样插值；signal 参数位置、提供方顺序、回退及重试政策保留。
- Firecrawl HTTP 错误增加可选独立 diagnostic 字段，保留原 message 兼容；工具按结构化状态本地化自有前缀，不推断说明字符串。Importer 元信息搜索沿用检查点 UI（旧缺省简中）并传回 error_code，元信息范围及确认写入约束不变。上述普通/导入网页链路新增红→绿回归及真实客户端构造验证。
- 当前进度 41/60，7.2 / 7.4、8.3 / 8.4 / 8.7 与 10–12 仍未完成；本阶段不把网页反馈子集判定为普通工具/Importer 全链路完成。最近提交仍为 afa56017，本阶段未提交。
- 最终全量回归：350 个文件通过、1 个跳过；3436 项通过、5 项跳过。lint、type-check、三语言 key/参数/编译、Prettier 与 quality-check 通过；复杂度提取保持名称顺序及评分公式，CI diff 门禁死代码、重复、健康度新增问题均为 0。两轴审查本轮范围无剩余发现，完整目标保持活动状态。

## 段落与批次译文工具反馈（2026-09-30）

- 段落工具自有必填、书籍/段落/译文查找、空段落、模型、正则与关键词校验、未知模型标签和成功/无匹配反馈迁入三语言资源。辅助函数显式传入执行 UI，已标识异常采用 LocalizedError 与固定 code；用户译文、替换文本、历史来源名称及正则诊断保留原文。语言不匹配回归改为检查 code，继续验证拒写与数据库不变。
- 批次消息常量改为绑定执行 UI 的消息工厂，所有相关验证、纠错、处理、失败及成功组装 helper 显式使用同一上下文；入口固定 UI/目标语言。容差/双倍批次、原文前缀、ID 纠错/歧义、引号细节、长度与历史复用警告、部分成功、note 和动作概要提供三语言版本，未更改 schema、枚举、阈值、范围或保存回调。
- resolveParagraphId 直接返回机器错误码，删除按错误说明比较的身份判定。任务状态、书籍、模型及处理异常补固定身份；底层已标识的自有异常按 UI 渲染并保留 code，第三方字符串/对象诊断安全格式化并原样插值。工具仍只验证并返回接受项，实际译文保存仍由既有调用方回调执行。
- 新增段落、批次的真实书库/状态回归，覆盖三 UI 的旧 index/缺 ID、缺段落/版本、模型与正则、英文成功/部分成功、引号/ASCII 配对、长度警告、用户文本、前置错误与外部诊断，以及异步等待中更换 context 语言。每类新行为均有有效红→绿证据；既有中文批次与段落行为回归保持通过。
- 质量门禁显露的语言资源入口拼装、书籍前置与读取语言样板已复用：paragraph/batch 由既有 tool-feedback 聚合，书籍只保留单一校验实现，只读包装器统一捕获并传 UI/目标 primitive。未增加抑制或根白名单，重构后再次两轴复查无发现。
- 当前整体进度仍为 41/60：本轮是 8.3 的完整段落/批次子集，帮助工具及 Importer 等剩余反馈仍须完成，7.2 / 7.4 / 8.3 / 8.4 / 8.7 与 10–12 继续保持活动范围，未按此子集勾选整体完成。最近提交仍为 afa56017，本轮未提交。
- 最终全量回归：352 个文件通过、1 个跳过；3459 项通过、5 项跳过。lint、type-check、三语言资源编译与 key/参数检查、Prettier、diff 检查及 quality-check 通过；CI diff 门禁死代码、重复与健康度新增问题均为 0。

## 帮助系统语言基础与阶段提交（2026-09-30）

- 页面与 AI 帮助工具共用显式语言的 HelpService，三语索引各含相同 59 个文档 ID；16 篇指南的分类使用稳定 ID、章节使用显式稳定锚点，并保留旧中文锚点映射。历史更新日志沿原资源路径读取，正文未修改。
- 帮助页面三设备变体的导航、状态与入口文本接入三语资源；语言切换保留当前文档、对应章节及分类折叠，旧语言索引/正文晚返回和卸载后的请求不写回。AI 搜索、列表、完整正文与导航按执行 UI 读取同一资源，缺译本明确报错。
- 审查发现的跨文档阅读位置泄漏已用新 URL 锚点/无锚点置顶回归先红后绿修复；缓存定位等待期间也核验请求、语言、文档与卸载状态。首次启动快速指南消费者复用章节解析，显示标题不包含锚点协议标记。
- 本阶段只建立三语索引、读取链路与简中稳定锚点；英文、繁中完整指南正文以及现有指南的产品行为更新仍属于 11.2 / 11.3，11.1 / 11.4 暂不勾选完成。整体进度保持 41/60。
- 提交前全量覆盖率回归：355 个文件通过、1 个跳过；3478 项通过、5 项跳过。lint、type-check、三语资源 key/参数/编译、Prettier 与 quality-check 均通过；CI diff 门禁死代码、重复与健康度新增问题均为 0。

## 三语言完整帮助指南（2026-09-30）

- 16 个稳定文档 ID 现各有简中兼容根文件、繁中与英文完整正文，共 48 篇；新增的通用设置与语言/同步章节在三语使用相同锚点。保留原操作结构与约束，更新建书真正写入时点、独立目标、缺译文/译名行为、所有语言原文失效、Importer 检查点/撤销、共享记忆与目标索引，以及 manifest v4、书内实体长期删除记录与新身份恢复。历史 releaseNotes 正文无改动。
- 三语 59 项索引保持文档身份与分类 ID；快速开始简介可按英文 target language 及繁中設定查询。全部章节 ID、旧中文别名目标与本地文档/锚点链接校验通过。真实文件回归逐篇验证 HelpService 和 AI 工具返回相同的完整正文与章节，不使用短摘要或简中 fallback 冒充译本。
- 首次启动快速指南接入同一显式语言资源与本地化标题/加载/按钮；请求、语言、关闭和卸载守卫防止旧响应发布。审查发现切到未完成语言再切回旧语言时缓存标记与空正文不一致，已有效先红后绿修复。三设备初开 /help 默认读取 front-page，并覆盖可选路由参数空串。
- 英文执行在界面切繁中后导航仍携带稳定章节 ID，工具反馈保留英文，页面按当前语言读取。缺失资源明确错误，旧请求晚返回、旧锚点与分类折叠沿前阶段回归保持通过。
- 两轴审查发现的英文删除记录范围误译及繁中反引号内按钮标签已修正，最终复核无剩余确定问题。本轮完成 11.1–11.4，整体进度 45/60；剩余 AI 执行/importer 全覆盖、UI 文案与集成验收继续保持活动范围。
- 最终全量覆盖率回归：357 个文件通过、1 个跳过；3490 项通过、5 项跳过。lint、type-check、三语 key/参数/编译、Prettier、diff 检查及 quality-check 通过，CI 差异内死代码、重复、健康度新增问题均为 0。当前修改未提交，最近本地提交为 b9616736。

## Importer 校验与错误反馈（2026-09-30）

- 固定 coded Error 的 348 处构造接入结构化错误身份与三语言资源，覆盖原先 312 类不同说明；schema 校验将字段/类型/数值限制作为具名参数，工具权限、来源授权、正文引用、草稿/方案版本、解析/归档上限及最终确认条件不变。既有 CODE 前缀保留，失败控制流不以译后的说明识别身份。
- ImportToolExecutor 在宿主显式语言或检查点语言下投影工具结果、操作事件与 afterResult 保存；ImportAgentService 显式传执行快照。Worker 序列化和解析客户端恢复消息身份，旧纯文字及外部诊断保持原文。新的 ImportFailure 只增加可选说明元数据，不改变导入任务的同步范围或数据库索引。
- 23 组结构化方案/配方冲突补三语说明与身份，转发保留元数据。读库失败记录携带原异常，嵌套自有错误可经 JSON/Worker/检查点往返后重新按执行 UI 渲染；书名、路径、第三方诊断不翻译。章节部分失败字符串沿 execute/dispatch/read 显式语言读取。
- 两轴审查发现的 Reader 压平、批次摘要丢身份和 Storage 自有说明误作原始插值均以有效先红后绿回归修复。批次错误先本地化再限制 300 字符，Date/二进制/用户内容保留原 JSON 语义；Agent 根失败在设置变化后仍沿执行快照记录，HTML 诊断保留状态码/外部标题，自有无标题说明三语化。
- 定向 importer 回归 425 项通过；最终全量回归 358 个文件通过、1 个跳过，3503 项通过、5 项跳过。lint、type-check、三语言 key/参数/编译、Prettier、diff 检查与 quality-check 通过，CI 差异死代码、重复、健康度新增问题均为 0；最终两轴复查在本轮范围内无剩余确定问题。
- 本轮仍是 8.4 的错误/冲突反馈子集。提取警告、排除原因、默认推断标题、配方差异/失效说明、未迁移的取消与 UI 反馈仍继续实施，不据此勾选 7.2 / 7.4 / 8.4 全部完成。整体进度保持 45/60，当前修改未提交，最近本地提交仍为 b9616736。

## Importer 警告、默认标题与反馈传递（2026-09-30）

- ImportNotice 兼容旧字符串及带固定身份的自有说明。提取/编码/EPUB 警告、HTML/Markdown 排除原因、文本结构提示、配方差异与失效、元信息冲突、书库匹配理由、缺章和预览说明、自有取消及撤销不可用原因接入三语资源；用户原文、原始标题、URL、选择范围和自定义原因保留。旧纯字符串不按显示文字猜测重译。
- 默认卷章名通过显式 ParserWorkOptions.uiLocale 贯穿主线程与 Worker，在生成时固定；默认新任务与网站交接名称使用创建时 UI，用户名称保持。Importer 提示词的状态快照也按执行语言投影已标识说明，必要选择、正文引用、范围验证与最终确认条件未改。
- 来源预览、排除列表、配方/完整性/导入历史及操作详情消费者支持结构化说明；当前 UI 能即时显示对应语言，历史用户字符串保持原文。预览 catch 保留异常身份；缺章列表兼容旧字符串去重，避免相同未取得章节重复计数。
- 公共执行器的参数不完整、工具权限和结果错配说明按固定执行 UI 生成，协议代码与拒绝条件保持。BookSyncError 接入 LocalizedError；生产 Replay、再次转抛、正文严格读取、逐章比对、应用收集、致命/非致命和额度尾部均保留自有异常身份及原诊断。失败正文不写入书库。
- 审查发现的预览压平、缺章对象显示、旧新重复统计及生产回放/收集丢身份均有有效先红后绿回归；新测试实际挂载 provideImportPage/Pinia/router，实际调用 Plan.preview、BookSyncReplay、BookSync apply/deepCheck。额度耗尽 5 项计数与剩余诊断回归保持通过。
- 质量门禁的两处复杂度问题通过提取 missingChapters 与 collectFailure 解决，未加入抑制/白名单；两轴最终复核确认去重、分类、fatal/partial/quota 顺序及工具守卫无确定残余。
- 最终 72 个 importer/book-sync 文件 605 项定向回归通过；全量覆盖率 360 个文件通过、1 个跳过，3528 项通过、5 项跳过。lint、type-check、资源 key/参数/编译、Prettier、diff 检查与 quality-check 通过；CI 差异内死代码、重复、健康度新增问题均为 0。历史 releaseNotes 正文无修改。
- 整体仍为 45/60：本轮完成剩余警告及发现的公共执行反馈接线，但 7.2 / 7.4 / 8.3 / 8.4 的完整入口/恢复/权限验收尚未据全任务范围重新核对，不凭当前模块扫描或定向审查勾选全部完成。后续进入 UI 文案迁移并完成 AI 全入口审计。当前修改未提交，最近本地提交仍为 b9616736。

## 首页、书库与导航语言迁移（2026-09-30）

- 首页和书库的桌面、平板、手机变体，以及共享导航、系统栏、侧栏、进度入口与页脚固定文本接入三语言资源。排序菜单使用稳定值并响应当前语言，搜索词、用户书名及保存动作保持；字数和书库相对日期使用显式 UI 语言。
- BookDialog 及封面、来源链接、卷章列表片段接入三语；必填校验保存状态标记，切换语言即时重绘说明且不重建未保存表单。审查发现的章节行/空列表、进度空状态、英文一周/一个月和书库标签遗漏均已修复。
- 新行为先以菜单/格式/操作反馈、实际组件挂载和表单校验回归确认失败，再实施修复。旧组件测试安装真实 i18n 插件，继续验证桌面更新徽标及平板弹层锚点身份。
- 本机独立浏览器检查覆盖首页/书库三种语言及三种尺寸，未观察到页面横向溢出；手机首页截图存在启动过渡帧，本轮不据此宣称完整视觉或全部用户旅程验收。浏览器产物不进入产品提交。
- 提交前最终全量覆盖率回归为 363 个文件通过、1 个跳过，3542 项通过、5 项跳过；lint、type-check、三语资源检查、quality-check、SPA 构建与 OpenSpec 严格校验通过。质量检查发现的系统栏基础样式、进度副标题与格式绑定三处重复已提取共享实现，CI 差异内死代码、重复与健康度问题均为 0。章节字数单位另经有效红→绿修复。副标题提取的抽屉关闭生命周期问题经真实关闭状态回归先红后绿修复，任务监听保留父组件、共享片段仅渲染 props。整体进度保持 45/60，10.1 仍为部分完成，其他通用弹窗、内部面板及剩余页面继续实施。

## 通用封面与卷章、实体编辑弹窗（2026-09-30）

- 封面管理、预览/历史、URL 校验、上传/删除/复制反馈和空状态接入三语言资源；通用手机弹窗的缺省关闭标签即时响应语言，显式传入的标签保持。图片上传服务使用 LocalizedError 的固定身份与可重绘说明，HTTP 状态、原始网络诊断、用户文件名及 URL 保留；原校验顺序、协议限制与远程删除失败后的本地移除行为未变。
- 卷章添加/编辑、日期统计、四类删除确认及恢复列表接入三语；强提示中的实体原名仍用 slot 强调。恢复类型和时间按当前 UI 显示，选中身份不随语言变更。术语/角色/别名表单的标签、说明和性别选项响应语言，目标语言守卫及未保存译名保留。
- 可翻译输入/标签控件的结果、应用、选择和成功/失败说明及按钮无障碍名称接入三语；公共术语翻译的无模型反馈与缺省处理说明使用 UI 语言，执行快照与书籍目标的原绑定逻辑保持。
- 文件校验/HTTP 包装、网络诊断、复制、弹窗关闭、封面 URL 草稿、恢复类型日期、性别/译名草稿及无模型反馈均有有效先红后绿证据。共享添加按钮和删除壳用实际挂载回归确认保存 trim、原名强调、卷级警告和一次确认事件；既有目标语言编辑守卫回归保持。
- 质量检查暴露的添加/删除模板及实体类型重复已提取到纯展示片段和共用 props/事件类型；父级表单与任务生命周期不迁移，不加入 Fallow 抑制或根白名单。两轴审查及提取后的复核在本轮范围内无剩余确定发现。
- 全量覆盖率回归为 370 个文件通过、1 个跳过，3554 项通过、5 项跳过。三語资源 key/参数/编译、lint、type-check、SPA 构建和 quality-check 通过；CI 差异内死代码、重复及健康度问题均为 0。英文封面管理实际在三种尺寸打开且无页面横向溢出，移动截图已人工查看。
- 整体仍为 45/60；10.1 / 10.2 的其余通用入口、书籍详情页面、阅读/面板/章节动作及其他模块继续实施，不以本轮弹窗子集或英文单模块截图判定完整三语旅程已验收。当前修改未提交，最近本地提交为 e104d097。

## 书籍详情骨架、章节目录与阅读工具栏（2026-09-30）

- 三设备详情骨架、侧栏设置导航、卷章目录/行操作、手机概览/阅读器/批量入口、阅读工具栏、原文/译文预览、章节空状态与导航、搜索替换及快捷键说明接入三语。菜单值、禁用条件、回调和折叠/选中身份保持；用户卷章标题、模型名和撤销描述按原内容插值。
- 详情数量和相对日期使用当前 UI 格式，章节标题/译文完成度继续按书籍目标选择。编辑模式选项改为响应式标签，唯一消费者显式读取 computed.value；翻译按钮及手机批量菜单即时更新固定标签，新动作仍经原执行快照入口。卷章添加/更新/删除反馈三语化，原目标检查、保存、移动和撤销逻辑保留。
- 平板 CSS 可见的原文/译文列说明移到响应式 CSS 变量，不再假定日语原文或中文目标。实际矩阵发现 ASCII 竖线被 i18n 当作复数分隔，导致仅显示原文半句；经真实挂载的有效红→绿修复，并复用显式 locale 的语言名称，使英文 UI/简中书籍显示完整目标，繁中 UI 也保持同一目标。
- 新运行时行为分别以真实 ChapterManagement 保存、真实章节翻译菜单、provideBookDetailsPage 格式及编辑模式和 Tablet CSS 变量挂载回归先红后绿。旧同步返回和中文菜单测试显式安装语言/初始化设置；原模型、目标保存及编辑行为回归保持。两轴审查与列标题修复复核在本轮范围内无剩余确定发现。
- 最终全量覆盖率为 375 个文件通过、1 个跳过，3559 项通过、5 项跳过；lint、type-check、资源 key/参数/编译、quality-check、Prettier 与 SPA 构建通过，CI 差异内死代码、重复、健康度问题均为 0。本机独立 QA 的三语言三尺寸 9 项目录/空章节阅读检查无横向溢出，平板 computed CSS 逐语种读回完整简中目标；英文移动和平板截图已人工查看。
- 整体保持 45/60：术语/角色/记忆等完整面板、段落操作内部、翻译设置与任务反馈、其余设置/Importer 页面及完整带正文/AI/同步旅程仍待推进。本轮空章节矩阵不替代这些验收，不据此勾选 10.2 或 12.x。当前修改未提交，最近本地提交仍为 e104d097。

## 术语、角色与共享记忆面板（2026-09-30）

- 术语/角色面板的标题、说明、搜索/空状态、批量删除、导入导出反馈、卡片译名/别名/性别以及章节实体弹层提供完整三语资源。自有反馈使用已标识错误按 UI 渲染，第三方诊断保留；数据导入和回退仍使用原语言槽及实体身份。单条英文导出/导入和数量显示使用单数。
- 记忆管理/详情/空状态/队列进度/卡片及引用评分的固定说明、日期和相对时间接入当前 UI。用户摘要、正文及引用内容保持共享原文，评分数值/权重和查询输入未改。相对时间新增显式可选 locale，默认简中保留旧调用及原分段阈值；目录/搜索等仍使用原状态与请求生命周期。
- 审查发现术语批量删除和记忆未保存确认在打开时缓存旧语言。改为同一 ConfirmationOptions 对象的响应式 getter，保留原删除 ID/快照、草稿及 accept/reject 回调；真实 PrimeVue 挂载回归确认打开后切 UI 重绘，并只删除原 ID/提交原草稿一次。英文导入单数遗漏也已修复，真实文件入口验证单条术语写入及译名语言保留。
- 质量检查的实体弹层标题与记忆保存重复已提取纯展示片段及共用校验/错误收尾，合法书籍 ID 在等待前捕获，创建撤销绑定原书籍。无书籍和空正文先后校验、失败释放按钮和保留未保存内容经复核/回归保持；未增加 Fallow 抑制或根白名单。两轴发现均已修复并复核，原测试缺失的 setup 导入已补。
- 最终覆盖率回归为 379 个文件通过、1 个跳过，3569 项通过、5 项跳过；lint、type-check、资源 key/参数/编译、quality-check、Prettier 和 SPA 构建通过。CI 差异内死代码、重复、健康度问题均为 0。独立 QA 的三个面板 × 三语言 × 三种尺寸共 27 项无页面横向溢出，英文桌面术语及移动记忆截图已人工核对；截图等待标签实际 CSS 过渡完成，用户示例正文及简中目标译名保留。
- 整体保持 45/60。10.2 的段落操作、翻译设置及向量管理内部和完整集成旅程仍待推进，其他设置/聊天/Importer 页面及 AI 全入口终审也未完成。本轮面板矩阵不代替其余任务验收。当前变更未提交，最近本地提交仍为 e104d097。

## 翻译设置、历史与手动段落操作（2026-09-30）

- 共享书籍翻译表单、章节特殊指令和手机设置抽屉的全部说明、无障碍标签、默认/失效模型占位以及保存/取消接入三语。模型哨兵、真实 ID、目标语言与表单 payload 保持；UI 切换不重置未保存开关。语言选择器继续使用原生名称。
- 段落编辑提示、操作弹层、翻译历史/未知模型与语言名称接入 UI 语言，用户译文保持原文；历史继续允许查看其他语言但拒绝选入当前目标。手动保存、历史选择、搜索替换、导出菜单/结果及原文编辑反馈接入显式当前 UI；已标识异常按身份渲染，第三方诊断保留。模型枚举、选用、语言槽及导出数据路径未改。
- 实际保存入口的书籍/章节设置和实体弹层、书籍信息反馈一并接线；新增状态描述按操作时 UI 生成，历史已有自由描述不重译。审查发现的批量替换状态说明漏迁已用真实回调有效红→绿修复。质量检查的局部包装重复改为复用既有 translateText 入口，未引入抑制或根配置白名单。
- 保存设置的真实挂载回归暴露统计等待期间读取空书籍或旧字数混新结构的竞态。calculateStats 捕获书籍引用和请求序号，新请求可取代旧请求；清空和卸载使旧请求失效，只有当前请求发布/收尾。真实 provide/Pinia 加延迟统计回归先红后绿，保留原字数/卷章数公式。两轴复核在本轮范围内无剩余确定问题。
- 最终全量覆盖率为 383 个文件通过、1 个跳过，3575 项通过、5 项跳过；lint、type-check、资源 key/参数/编译、quality-check、Prettier 与 SPA 构建通过，CI 差异内死代码、重复、健康度均为 0。独立 QA 三语言三尺寸共 9 个共享设置表单无页面横向溢出，保存按钮全部可滚动到达，书籍目标保持简中；英文桌面和移动底部截图已人工查看，侧栏英文数量单位亦补单复数。
- 整体仍为 45/60：向量管理内部、AI 任务/聊天/操作详情、应用设置/AI 配置/Importer 页面与全入口/集成验收继续推进。当前语言资源和表单矩阵不替代这些任务；本轮不勾选 10.2 / 12.x 完成。当前修改未提交，最近本地提交仍为 e104d097。

## 向量管理与测试查询界面（2026-09-30）

- 本地向量索引抽屉、启用/移动限制说明、模型/后端/状态、旧版本横幅、跨书任务提示、队列数量/ETA、回填/重建和测试查询提供三语资源。模型版本与 @ 符号保留，特殊字符经消息编译检查；队列控制、枚举、查询上限和检索算法未改。
- 测试查询保留原异常并按当前 UI 投影已标识的自有说明；结果原名/预览保留，空标题和摘要的占位移到显示层，使切语言时即时更新。用户查询内容保持。关闭、换书、卸载使旧请求失效，旧结果/错误/finally 不再污染新窗口；真实关闭后晚失败回归先红后绿。
- 审查发现生产查询入口仍抛简中普通 Error，模拟 LocalizedError 回归不能证明真实入口覆盖。queryChapters 的缺书籍 ID、缺查询、未就绪及查询向量为空改为固定身份错误，保留原简中说明和校验顺序。真实服务调用仅替换 embedding 边界的回归先红后绿；原服务/tool 查询行为回归保持。两轴审查发现均修复并复核。
- 最终全量覆盖率为 385 个文件通过、1 个跳过，3580 项通过、5 项跳过；lint、type-check、三语资源 key/参数/编译、quality-check、Prettier、SPA 构建及 OpenSpec 严格校验通过，CI 差异死代码、重复与健康度均为 0。此次未据自动检查宣称实际向量生成、查询的三设备三语旅程已验收。
- 整体仍为 45/60。详情主体、面板、翻译设置和本轮向量 UI 已迁移，10.1/10.2 继续进行全覆盖漏项/实际流程核查；AI 全入口、其余设置/聊天/Importer UI 和最终集成验收仍未完成。当前修改未提交，最近本地提交仍为 e104d097。

## AI 配置页面与模型表单（2026-09-30）

- 三设备 AI 模型页面、任务路由 picker、模型表单、思考等级、上下文/输出限制、自定义 Header、目录来源及校验/未保存提示接入三语。任务数组和选择项响应 UI，表单校验保存消息键；切语言保留草稿、模型 ID、路由哨兵、任务键、温度和 headers。是否启用默认任务只判断布尔标志，不比较本地化的「无」。删除确认即时重绘且保留原操作回调。
- ConfigService 资料与可用性入口接收显式语言，测试提示、前置校验、成功/取消/超时和脱敏说明提供三语。当前测试结果保存可选自有消息身份，由显示层按当前 UI 投影；外部已脱敏诊断保持原文。toast 沿启动 UI 生成一致的摘要/详情，语言切换不重发测试、不清当前结果。
- 页面标签/路由、表单草稿/校验、真实资料未命中与缺密钥、当前失败状态切语言及等待中切语言后异常回执分别经有效红→绿回归。既有模型资料、30 秒测试、取消/迟到结果、输入法焦点、思考等级、自定义 Header 与持久化回归保持；旧组件测试显式安装 i18n。
- 两轴发现的测试状态陈旧与异常回执混合语言已修复并复核。质量检查的 picker 重复派生归入已有页面上下文，可用性异常分类/脱敏提取私有 helper，保留取消优先级、信号、超时和 finally 清理；未增加抑制或根白名单。
- 最终全量覆盖率为 389 个文件通过、1 个跳过，3587 项通过、5 项跳过；lint、type-check、三语资源 key/参数/编译、quality-check、Prettier、SPA 构建及 OpenSpec 严格校验通过，CI 差异死代码、重复和健康度均为 0。独立 QA 三语言三尺寸 AI 空页面共 9 项无横向溢出，英文桌面和手机截图人工查看；未发送真实模型测试请求，不据空页面矩阵宣称完整配置旅程已验收。
- 整体保持 45/60。10.3 的应用设置其余标签、同步/备份、代理/爬虫/更新等仍继续迁移，其他 AI 全入口/聊天/Importer UI 和最终验收仍未完成。当前修改未提交，最近本地提交仍为 e104d097。
