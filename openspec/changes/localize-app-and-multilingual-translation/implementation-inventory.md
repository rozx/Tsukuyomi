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
