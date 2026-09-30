export default {
  aiImportTools: {
    add_sources: '只追加已觀察到的發現引用；保留父來源及用途，不抓取內容。',
    add_sources__parameters__properties__filter:
      '在顯式傳入的來源/發現或目錄窗口內篩選；name 匹配名稱，locator 匹配 URL/文件路徑，多條件取交集，不擴大來源範圍。',
    add_sources__parameters__properties__filter__properties__locator__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    add_sources__parameters__properties__filter__properties__locator__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    add_sources__parameters__properties__filter__properties__name__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    add_sources__parameters__properties__filter__properties__name__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    apply_draft_batch:
      '應用已預覽的草稿批量方案，整批原子提交；草稿變化後必須重新預覽。重復執行同一批次不重做；不寫書庫。',
    apply_text_structure:
      '應用已預覽的文本結構方案到草稿。原子建立或明確替換卷章；保留原文引用，不寫書庫。來源或草稿變化後須重新預覽；同一方案重復應用不重做。',
    ask_user:
      '向使用者提出一個必要問題。導入執行會保存問題並暫停，使用者在導入工作台回答後恢復，並回傳回答。只用於無法從來源判斷的關鍵歧義。',
    ask_user_batch:
      '一次向使用者提出多個必要問題。導入執行會保存問題並暫停，使用者須回答全部問題後才會恢復。',
    ask_user_batch__parameters__properties__questions: '問題列表（必填，至少 1 題）',
    ask_user_batch__parameters__properties__questions__items__properties__allow_free_text:
      '是否允許使用者輸入自定義答案（預設 true）',
    ask_user_batch__parameters__properties__questions__items__properties__cancel_label:
      '取消按鈕文本（可選）',
    ask_user_batch__parameters__properties__questions__items__properties__max_length:
      '自定義輸入最大長度（可選）',
    ask_user_batch__parameters__properties__questions__items__properties__placeholder:
      '自定義輸入框的佔位符（可選）',
    ask_user_batch__parameters__properties__questions__items__properties__question:
      '要向使用者展示的問題（必填）',
    ask_user_batch__parameters__properties__questions__items__properties__submit_label:
      '提交按鈕文本（可選）',
    ask_user_batch__parameters__properties__questions__items__properties__suggested_answers:
      '可選的候選答案列表（使用者可一鍵選擇）',
    ask_user__parameters__properties__allow_free_text: '是否允許使用者輸入自定義答案（預設 true）',
    ask_user__parameters__properties__cancel_label: '取消按鈕文本（可選）',
    ask_user__parameters__properties__max_length: '自定義輸入最大長度（可選）',
    ask_user__parameters__properties__placeholder: '自定義輸入框的佔位符（可選）',
    ask_user__parameters__properties__question: '要向使用者展示的問題（必填）',
    ask_user__parameters__properties__submit_label: '提交按鈕文本（可選）',
    ask_user__parameters__properties__suggested_answers: '可選的候選答案列表（使用者可一鍵選擇）',
    create_todo:
      '建立新的待辦事項。可以建立單個待辦事項（使用 text 參數）或多個待辦事項（使用 items 參數）。當使用者要求添加任務或待辦事項時使用此工具。[警告] 重要：建立待辦事項時，必須建立詳細、可執行的待辦事項，而不是總結性的待辦事項。每個待辦事項應該是具體且可操作的，而不是高層次的總結。如果你規劃了一個包含多個步驟的任務，必須為每個步驟建立一個獨立的待辦事項。',
    create_todo__parameters__properties__items:
      '多個待辦事項的內容列表（與 text 參數二選一）。用於批量建立多個待辦事項。[警告] 重要：每個待辦事項必須提供詳細、具體、可執行的描述，而不是總結性的描述。例如：["翻譯第1-5段，檢查術語一致性", "翻譯第6-10段，確保角色名稱翻譯一致"] 而不是 ["翻譯文本", "檢查一致性"]。',
    create_todo__parameters__properties__text:
      '單個待辦事項的內容描述（與 items 參數二選一）。[警告] 重要：必須提供詳細、具體、可執行的描述，而不是總結性的描述。例如："翻譯第1-5段，檢查術語一致性" 而不是 "翻譯文本"。',
    delete_todo: '刪除待辦事項。',
    delete_todo__parameters__properties__id: '待辦事項的 ID',
    edit_import_draft:
      '按版本原子編輯草稿。先聲明小說候選及來源歸屬，再建卷章；sourceIds 可傳空數組由宿主從引用計算。只能引用原文；不能偽造確認或寫入書庫。',
    edit_import_draft__parameters__properties__operations__items__properties__candidates__items__properties__content__items:
      'extraction 引用已保存提取結果（可選塊範圍、塊內 start/end）；existing 必須給出當前目標的 bookId、bookRevision、chapterId、paragraphId。',
    edit_import_draft__parameters__properties__operations__items__properties__candidates__items__properties__content__items__properties__excludeRanges:
      '相對該引用原始解析文本的 UTF-16 排除範圍，升序、非重疊。優先使用批量工具計算。',
    edit_import_draft__parameters__properties__operations__items__properties__chapter__properties__content__items:
      'extraction 引用已保存提取結果（可選塊範圍、塊內 start/end）；existing 必須給出當前目標的 bookId、bookRevision、chapterId、paragraphId。',
    edit_import_draft__parameters__properties__operations__items__properties__chapter__properties__content__items__properties__excludeRanges:
      '相對該引用原始解析文本的 UTF-16 排除範圍，升序、非重疊。優先使用批量工具計算。',
    extract_content:
      '按明確來源及規則提取原文，保存完整結果並回傳內容引用；每批最多八項，不改寫正文。',
    extract_content__parameters__properties__filter:
      '在顯式傳入的來源/發現或目錄窗口內篩選；name 匹配名稱，locator 匹配 URL/文件路徑，多條件取交集，不擴大來源範圍。',
    extract_content__parameters__properties__filter__properties__locator__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    extract_content__parameters__properties__filter__properties__locator__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    extract_content__parameters__properties__filter__properties__name__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    extract_content__parameters__properties__filter__properties__name__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    extract_novel_info: '檢查小說元資訊、目錄資源和後續發現引用；不會取得目錄外章節正文。',
    get_book_info: '讀取明確小說 ID 的基本資訊，不附帶模型配置、憑據或記憶。',
    get_chapter_batch: '分頁查看章節批次的狀態、錯誤和正文引用；正文用 read_source 按需抽查。',
    get_chapter_info: '按明確小說和章節 ID 分頁讀取原文及對應引用所需修改序號。',
    get_import_draft:
      '讀取當前草稿版本、目標與必要問題。chapters 分頁列出章節概要；chapter 按 chapter_id 分頁讀取該章內容引用。',
    get_text_structure:
      '分頁讀取已保存的文本結構方案，查看卷章標題、字數、原文區間、首尾片段、警告或排除原因；不重新掃描。',
    inspect_source: '顯式檢查一個來源的結構、元資訊和資源引用；不自動追加或跟隨鏈接。',
    list_chapters: '按明確小說 ID 分頁讀取卷章結構。',
    list_sources: '列出當前任務來源及狀態；不讀取正文。',
    list_todos:
      '列出當前任務的待辦事項列表。回傳當前任務關聯的所有待辦事項，每個待辦事項包含 id、text、completed 等字段。可以過濾取得所有、僅未完成或僅已完成的待辦事項。注意：此工具僅回傳當前任務（taskId）的待辦事項，不會回傳其他任務的待辦事項。',
    list_todos__parameters__properties__filter:
      '過濾類型：all-回傳所有待辦事項列表，active-僅回傳未完成的待辦事項列表，completed-僅回傳已完成的待辦事項列表',
    mark_todo_done:
      '將待辦事項標記為完成。無需先標記進行中。完成多項時用 ids 一次性批量標記，避免逐條調用。標記完成後，系統會自動把下一項待辦標記為進行中。',
    mark_todo_done__parameters__properties__id: '單個待辦事項的 ID（與 ids 二選一）',
    mark_todo_done__parameters__properties__ids:
      '多個待辦事項的 ID 列表（與 id 二選一）。一次性標記多項時優先使用。',
    mark_todo_working:
      '將待辦事項標記為進行中。通常無需調用：完成/建立待辦後系統會自動把下一項標記為進行中；僅在需要手動切換當前進行項時使用。',
    mark_todo_working__parameters__properties__id: '單個待辦事項的 ID（與 ids 二選一）',
    mark_todo_working__parameters__properties__ids:
      '多個待辦事項的 ID 列表（與 id 二選一）。一次性標記多項時優先使用。',
    prepare_chapter_batch:
      '抽樣確認後準備章節批次：固定來源、順序和規則，建立待提取草稿；不抓正文。source_ids、discovery_ids、catalog 三選一，每批最多 500 章。',
    prepare_chapter_batch__parameters__properties__filter:
      '在顯式傳入的來源/發現或目錄窗口內篩選；name 匹配名稱，locator 匹配 URL/文件路徑，多條件取交集，不擴大來源範圍。',
    prepare_chapter_batch__parameters__properties__filter__properties__locator__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    prepare_chapter_batch__parameters__properties__filter__properties__locator__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    prepare_chapter_batch__parameters__properties__filter__properties__name__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    prepare_chapter_batch__parameters__properties__filter__properties__name__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    preview_draft_batch:
      '預覽批量正文清理或卷章標題替換，保存版本綁定的方案；不修改草稿。最多 500 項，回傳命中數和最多五個示例。正文按每個內容引用處理，可跨其內部多行，不跨不同引用；僅刪除匹配片段或整行。標題支持 $1、$<name> 等捕獲組替換。空 scope 表示全部；各篩選條件取交集。',
    preview_draft_batch__parameters__properties__pattern__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    preview_draft_batch__parameters__properties__pattern__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    preview_draft_batch__parameters__properties__replacement:
      '僅標題 replace 可用；正文禁止替換或新增文本。',
    preview_draft_batch__parameters__properties__scope__properties__title__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    preview_draft_batch__parameters__properties__scope__properties__title__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    preview_import: '根據當前草稿版本生成真實差異與譯文影響，保存待使用者檢查的方案；不會應用。',
    preview_text_structure:
      '預覽 TXT／Markdown 的正文範圍與批量拆卷拆章，保存方案但不修改草稿。每批最多 500 章（含待歸類內容）。regex 用獨立整行標題模式，命名 title 組作標題；markdown 指定 chapter_level 和可選更淺的 volume_level，忽略代碼內偽標題；single 將範圍作一章。回傳計數與五個示例，完整方案用 get_text_structure 分頁查看。',
    preview_text_structure__parameters__properties__replace_chapter_ids:
      '明確替換該文件的已有草稿章；其他章保持不變。重疊時必須提供。',
    preview_text_structure__parameters__properties__resource_id:
      '已保存 TXT／Markdown 的 extraction contentId，不接受快照 ID。坐標相對其拼接文本。',
    preview_text_structure__parameters__properties__rules__properties__chapter_pattern__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    preview_text_structure__parameters__properties__rules__properties__chapter_pattern__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    preview_text_structure__parameters__properties__rules__properties__include_headings:
      '是否在正文保留章標題，預設 false；卷標題始終提取到卷名。',
    preview_text_structure__parameters__properties__rules__properties__selection:
      '可省略表示全部。start/end 各須唯一命中，保留兩標記之間的正文（不含標記）；body 與起止標記互斥，須唯一命中並有命名 body 捕獲組。',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__body__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__body__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__end__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__end__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__start__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__start__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    preview_text_structure__parameters__properties__rules__properties__volume_pattern__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    preview_text_structure__parameters__properties__rules__properties__volume_pattern__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    preview_text_structure__parameters__properties__volume_id:
      '未匹配卷標題的內容放入此已有卷；省略時建立未分卷。',
    read_source:
      '分頁讀取保存的快照或提取結果。blocks 回傳穩定塊 ID 與預覽；text 可繼續讀取完整文本，excluded 檢查排除記錄，inspection 檢查元資訊。',
    record_update_recipe:
      '網頁來源的章節與目錄一一對應並整理完成後，聲明這本書的更新配方。宿主只用已保存的快照離線回放：要求草稿中該站點的已選章節與目錄鏈接一一對應，並逐段復現草稿正文（固定正文章節除外，最多 20%）。不通過則拒絕並回傳差異示例；通過後作為一次草稿修改寫入。內置站點自動採用內置引擎（忽略 catalog_selector 和 chapter_filter），正文規則缺省時沿用導入時實際使用的提取規則。',
    record_update_recipe__parameters__properties__catalog_selector:
      '目錄鏈接不在標準目錄容器（nav、.toc 等）中時，指定鏈接所在範圍的 CSS 選擇器。',
    record_update_recipe__parameters__properties__chapter_filter:
      '在顯式傳入的來源/發現或目錄窗口內篩選；name 匹配名稱，locator 匹配 URL/文件路徑，多條件取交集，不擴大來源範圍。',
    record_update_recipe__parameters__properties__chapter_filter__properties__locator__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    record_update_recipe__parameters__properties__chapter_filter__properties__locator__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    record_update_recipe__parameters__properties__chapter_filter__properties__name__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    record_update_recipe__parameters__properties__chapter_filter__properties__name__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    record_update_recipe__parameters__properties__cleanup:
      '回放時依次執行的清理規則；草稿中用過的批量清理要一並聲明。',
    record_update_recipe__parameters__properties__cleanup__items__properties__pattern__properties__flags:
      '支持 g、i、m、s、u；預設全局、Unicode；如 im 表示忽略大小寫、多行。',
    record_update_recipe__parameters__properties__cleanup__items__properties__pattern__properties__pattern:
      '1–1000 字元。regex 不帶 / 分隔符；JSON 內反斜槓須轉義。',
    record_update_recipe__parameters__properties__content_rules:
      '正文提取規則；缺省時從草稿章節導入時使用的規則推導。',
    record_update_recipe__parameters__properties__pinned_chapter_ids:
      '有意手工修改過、回放無法復現的草稿章節；最多佔對應章節數的 20%。',
    record_update_recipe__parameters__properties__strip_heading:
      '正文首個非空行與目錄標題完全相同時刪除該行。',
    rename_import_task:
      '為當前導入任務命名，便於使用者在任務列表中區分。識別出書名等書本資訊後必須調用；通常用書名，可附作者或範圍。使用者手動命名後不能修改。',
    run_chapter_batch:
      '按準備好的計劃提取全部待處理章節並逐章保存到草稿，最多 3 路併發；回傳計數和少量異常，不回傳正文。中斷後續跑；retry_failed 只重試失敗項。',
    search_books: '按書名、作者或來源線索搜尋本地小說，只回傳候選及依據。',
    search_web: '僅搜尋作者、簡介、封面、別名等元資訊；結果保持 metadata-only，不能作為替代正文。',
    update_todos:
      '更新待辦事項的內容或狀態。可以更新單個待辦事項（使用 id 參數）或多個待辦事項（使用 items 參數）。可以更新文本內容或狀態。',
    update_todos__parameters__properties__id: '單個待辦事項的 ID（與 items 參數二選一）',
    update_todos__parameters__properties__items:
      '多個待辦事項的更新列表（與 id 參數二選一）。用於批量更新多個待辦事項。',
    update_todos__parameters__properties__items__items__properties__id: '待辦事項的 ID',
    update_todos__parameters__properties__items__items__properties__status:
      '新的待辦事項狀態（可選）',
    update_todos__parameters__properties__items__items__properties__text:
      '新的待辦事項內容（可選）',
    update_todos__parameters__properties__status:
      '新的待辦事項狀態（可選，僅當使用 id 參數時有效）',
    update_todos__parameters__properties__text: '新的待辦事項內容（可選，僅當使用 id 參數時有效）',
  },
};
