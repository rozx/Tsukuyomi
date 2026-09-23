# Spec Delta

## REMOVED Requirements

### Requirement: Dynamic update status in scraper dialog

**Reason**: 抓取器对话框已移除。旧行为是在对话框中加载远端内容后自动勾选「有更新」章节，这会在配方回放漂移时误勾大量章节，进而清空译文。

**Migration**: 由 `book-sync-workspace` 的「变更集展示」和「选择规则」取代：有更新章节显示段落级差异，并且不自动勾选。
