export default {
  aiTools: {
    add_translation:
      '為執行目標語言添加譯文版本，每種語言保留至多5個版本；必要時移除該語言最舊版本，其他語言保留。',
    add_translation_batch:
      '提交翻譯/潤色/校對結果，使用 paragraph_id。翻譯可在 working/review，潤色/校對僅在 working 調用。常規最多{max}段，允許10%容差至{tolerance}段；當前 chunk 未提交段落至多{doubleMax}段時，可一次提交至多{doubleMax}段。',
    add_translation_batch__parameters__properties__paragraphs:
      '結果數組，常規最多{max}段，允許10%容差至{tolerance}段；當前 chunk 未提交段落至多{doubleMax}段時，可提交至多{doubleMax}段。必須用 paragraph_id，禁止 index。',
    add_translation_batch__parameters__properties__paragraphs__items__properties__original_text_prefix__disabled:
      '原文前綴（可選），當前已禁用校驗。',
    add_translation_batch__parameters__properties__paragraphs__items__properties__original_text_prefix__enabled:
      '原文前綴錨點，建議開頭5–10字元，trim 後至少3、至多20字元，用於核對 paragraph_id 與原文。',
    add_translation_batch__parameters__properties__paragraphs__items__properties__paragraph_id:
      '段落 ID（唯一提交標識，從 chunk 中 [ID: xxx] 取得）',
    add_translation_batch__parameters__properties__paragraphs__items__properties__translated_text:
      '翻譯/潤色/校對後的文本',
    add_translation__parameters__properties__ai_model_id:
      'AI 模型 ID（可選，如果不提供則使用當前預設模型）',
    add_translation__parameters__properties__paragraph_id: '段落 ID',
    add_translation__parameters__properties__set_as_selected:
      '是否將新翻譯設置為當前選中的翻譯（預設 true）',
    add_translation__parameters__properties__translation: '新的翻譯內容',
    ask_user:
      '向使用者提問並等待使用者回答。會彈出全屏對話框展示問題與候選答案，使用者也可以輸入自定義答案。適用於關鍵歧義、缺失資訊或需要使用者偏好決策的場景。',
    ask_user_batch:
      '向使用者一次性提出多個問題並等待回答（Stepper 一題一屏）。適用於需要使用者一次確認多個偏好/關鍵歧義的場景；使用者中途取消會回傳已答部分（partial answers）。',
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
    batch_replace_translations:
      '只替換執行目標語言選用譯文中的匹配關鍵詞，保留其餘內容，不替換整段或其他語言/歷史版本。同時提供原文和譯文關鍵詞時須滿足兩者；僅提供原文關鍵詞時在目標譯文中找對應關鍵詞，未找到則跳過。',
    batch_replace_translations__parameters__properties__chapter_id:
      '可選的章節 ID，如果提供則僅在該章節內搜尋和替換（不處理其他章節）',
    batch_replace_translations__parameters__properties__keywords:
      '關鍵詞數組（可選），用於在翻譯文本中搜尋包含任一關鍵詞的段落（OR 邏輯）。如果與 original_keywords 同時提供，則段落必須同時滿足兩個條件。',
    batch_replace_translations__parameters__properties__max_replacements:
      '可選的最大替換數量（預設 100）。用於限制一次操作替換的段落數量，避免意外替換過多內容。',
    batch_replace_translations__parameters__properties__original_keywords:
      '原文關鍵詞數組（可選），用於在原文中搜尋包含任一關鍵詞的段落（OR 邏輯）。如果與 keywords 同時提供，則段落必須同時滿足兩個條件。',
    batch_replace_translations__parameters__properties__replace_all_translations:
      '兼容字段；始終只替換執行目標語言的選用版本，不擴大至全部歷史。',
    batch_replace_translations__parameters__properties__replacement_text:
      '替換文本，用於替換匹配的關鍵詞部分（不是替換整個翻譯）。例如：如果關鍵詞是"大姐"，替換文本是"姐姐"，則"大姐abc"會被替換為"姐姐abc"。如果只提供原文關鍵詞（沒有翻譯關鍵詞），工具會在翻譯文本中查找對應的關鍵詞進行替換；如果找不到匹配的關鍵詞，則跳過該段落。',
    create_character:
      "建立新角色設定。[警告] 重要：在建立新角色之前，必須使用 list_characters 或 get_character 工具檢查該角色是否已存在，或者是否應該是已存在角色的別名。如果發現該角色實際上是已存在角色的別名，應該使用 update_character 工具將新名稱添加為別名，而不是建立新角色。[禁止] **錯誤處理**：如果嘗試建立的角色名稱已存在（作為其他角色的主名稱），將拋出錯誤 \"角色 {'{'}name{'}'} 已存在\"，操作將失敗。",
    create_character__parameters__properties__aliases:
      '角色別名數組（可選），包含已知姓或名。不得自動生成帶敬語的別名。',
    create_character__parameters__properties__aliases__items__properties__id:
      '已有別名的穩定 ID；改名時必須保留。新增別名省略。',
    create_character__parameters__properties__aliases__items__properties__name:
      '來源語言不限的原始別名，通常為已知的姓或名。',
    create_character__parameters__properties__aliases__items__properties__translation:
      '別名的目標語言譯文',
    create_character__parameters__properties__description:
      '角色的簡短描述（可選）。[警告] **重要**：描述應該簡短，只包含重要資訊，避免冗長或不必要的細節。',
    create_character__parameters__properties__name:
      '角色原名，來源語言不限。已知全名時使用全名，不僅用姓或名；不得憑空補全未知的姓名部分。',
    create_character__parameters__properties__sex: '角色性別（可選）',
    create_character__parameters__properties__speaking_style:
      '角色的說話口吻（可選）。例如：粗魯、古風、口癖(desu/nya)等',
    create_character__parameters__properties__translation: '角色全名的執行目標語言譯名。',
    create_memory:
      '僅在沒有相關已有記憶可合併更新時建立。優先用 update_memory，將每條記憶限定為一個可復用的翻譯決定：稱呼、術語或文風。summary 是高權重檢索標題，應包含相關原名、目標譯名、別名與同義表達，以 / 分隔；content 用少量要點。避免重復記錄。',
    create_memory__parameters__properties__content: '要存儲的實際內容（少量要點）',
    create_memory__parameters__properties__summary:
      '摘要/檢索標題。包含可檢索的原名、目標譯名、別名、俗稱和同義表達，以 / 分隔；摘要命中權重遠高於 content。',
    create_term:
      '建立術語記錄。僅用於作品特定、上下文相關或需要特殊處理的術語，不為通用詞彙或已有固定詞典譯法的詞建立記錄。原名與目標譯名相同時，僅在作品中有特殊上下文含義需要說明時建立。每個術語只保留一個目標譯名。',
    create_term__parameters__properties__description:
      '術語的簡短描述（可選）。[警告] **重要**：描述應該簡短，只包含重要資訊，避免冗長或不必要的細節。',
    create_term__parameters__properties__name: '術語名稱（原文）',
    create_term__parameters__properties__translation:
      '術語的目標語言譯文。[警告] **重要**：每個術語只能有一個翻譯，不要使用多個翻譯（如"路人角色／龍套"），應選擇一個最合適的翻譯（如"龍套"）。',
    create_todo:
      '建立新的待辦事項。可以建立單個待辦事項（使用 text 參數）或多個待辦事項（使用 items 參數）。當使用者要求添加任務或待辦事項時使用此工具。[警告] 重要：建立待辦事項時，必須建立詳細、可執行的待辦事項，而不是總結性的待辦事項。每個待辦事項應該是具體且可操作的，而不是高層次的總結。如果你規劃了一個包含多個步驟的任務，必須為每個步驟建立一個獨立的待辦事項。',
    create_todo__parameters__properties__items:
      '多個待辦事項的內容列表（與 text 參數二選一）。用於批量建立多個待辦事項。[警告] 重要：每個待辦事項必須提供詳細、具體、可執行的描述，而不是總結性的描述。例如：["翻譯第1-5段，檢查術語一致性", "翻譯第6-10段，確保角色名稱翻譯一致"] 而不是 ["翻譯文本", "檢查一致性"]。',
    create_todo__parameters__properties__text:
      '單個待辦事項的內容描述（與 items 參數二選一）。[警告] 重要：必須提供詳細、具體、可執行的描述，而不是總結性的描述。例如："翻譯第1-5段，檢查術語一致性" 而不是 "翻譯文本"。',
    delete_character: '刪除角色設定。當確定某個角色不再需要時，可以使用此工具刪除。',
    delete_character__parameters__properties__character_id:
      '角色 ID（從 get_character 或 list_characters 取得）',
    delete_memory: '刪除指定的 Memory 記錄。當確定某個 Memory 不再需要時，可以使用此工具刪除。',
    delete_memory__parameters__properties__memory_id:
      'Memory ID（從 get_memory 或 search_memories 取得）',
    delete_term: '刪除術語。當確定某個術語不再需要時，可以使用此工具刪除。',
    delete_term__parameters__properties__term_id: '術語 ID（從 get_term 或 list_terms 取得）',
    delete_todo: '刪除待辦事項。',
    delete_todo__parameters__properties__id: '待辦事項的 ID',
    fetch_webpage:
      '直接訪問指定的網頁並提取其內容。當使用者提供了具體的網頁 URL 或需要查看特定網頁的詳細內容時使用此工具。工具會提取網頁的標題和主要內容文本，供 AI 分析。[警告] 重要：使用此工具時，必須仔細閱讀回傳的 text 內容，從中提取關鍵資訊來回答使用者的問題。如果回傳了 error，說明無法訪問該網頁。',
    fetch_webpage__parameters__properties__url:
      '要訪問的網頁 URL（必須是完整的 URL，包含 http:// 或 https://）',
    find_paragraph_by_keywords:
      '根據多個關鍵詞查找包含任一關鍵詞的段落。用於在翻譯過程中查找特定內容或驗證翻譯的一致性。支持在原文或翻譯文本中搜尋，如果同時提供兩者，則只回傳同時滿足兩個條件的段落。支持多個關鍵詞，回傳包含任一關鍵詞的段落（OR 邏輯）。[警告] **敬語翻譯**：翻譯敬語時，必須**首先**使用 search_memories 搜尋記憶中關於該角色敬語翻譯的相關資訊，**然後**再使用此工具搜尋該角色在之前段落中的翻譯，以確保翻譯一致性。如果提供 chapter_id 參數，則僅在指定章節內搜尋；如果不提供，則搜尋所有章節。回傳的 paragraph_index 為展示序號（從 1 開始計數），chapter_index / volume_index 為數組索引（從 0 開始計數）。',
    find_paragraph_by_keywords__parameters__properties__chapter_id:
      '可選的章節 ID，如果提供則僅在該章節內搜尋（不搜尋其他章節）',
    find_paragraph_by_keywords__parameters__properties__include_memory:
      '是否在響應中包含相關的記憶資訊（預設 true）',
    find_paragraph_by_keywords__parameters__properties__keywords:
      '原文關鍵詞數組（可選），用於在原文中搜尋包含任一關鍵詞的段落（OR 邏輯）。如果與 translation_keywords 同時提供，則段落必須同時滿足兩個條件。',
    find_paragraph_by_keywords__parameters__properties__max_paragraphs:
      '可選的最大回傳段落數量（預設 1）',
    find_paragraph_by_keywords__parameters__properties__only_with_translation:
      '是否只回傳有翻譯的段落（預設 false）。當設置為 true 時，只回傳已翻譯的段落，用於查看之前如何翻譯某個關鍵詞，確保翻譯一致性。',
    find_paragraph_by_keywords__parameters__properties__translation_keywords:
      '翻譯文本關鍵詞數組（可選），用於在翻譯文本中搜尋包含任一關鍵詞的段落（OR 邏輯）。如果與 keywords 同時提供，則段落必須同時滿足兩個條件。',
    get_book_info:
      '取得當前書籍的詳細資訊，包括標題、作者、簡介、標籤、備注以及卷章結構摘要。當需要瞭解書籍背景、上下文或查看使用者備注時使用此工具。',
    get_book_info__parameters__properties__include_memory:
      '是否在響應中包含相關的記憶資訊（預設 true）',
    get_chapter_info:
      '取得章節的詳細資訊，包括標題、段落列表（預設分頁）、翻譯進度等。章節可能很長，回傳內容會按 limit/offset 分頁；先用小 limit 確認方向，需要更多段落再通過 offset 繼續讀取，避免一次性拉整章把上下文塞滿。',
    get_chapter_info__parameters__properties__chapter_id: '章節 ID',
    get_chapter_info__parameters__properties__include_memory:
      '是否在響應中包含相關的記憶資訊（預設 true）',
    get_chapter_info__parameters__properties__limit:
      '回傳的段落數量上限（預設 30，最大 200）。章節可能有上百段，預設只取前 30 段避免 context 爆炸。',
    get_chapter_info__parameters__properties__offset:
      '起始段落索引（0-based，預設 0）。配合 limit 翻頁讀取。',
    get_character:
      '根據角色名稱取得角色資訊。在翻譯過程中，如果遇到已存在的角色，可以使用此工具查詢其翻譯和設定。[注意] **極重要**：如果名稱無法精確匹配，該工具會自動在後台對角色的原名、翻譯文本記錄以及全部已收錄的別名進行模糊搜尋和部分匹配，並回傳最相關的結果列表。[警告] **重要**：查詢角色資訊時，必須**先**使用此工具或 search_characters_by_keywords 查詢角色資料庫，**只有在資料庫中沒有找到時**才可以使用 search_memories 搜尋記憶。',
    get_character__parameters__properties__include_memory:
      '是否在響應中包含相關的記憶資訊（預設 true）',
    get_character__parameters__properties__name: '角色名稱（原文）',
    get_help_doc:
      '取得指定幫助文檔的完整內容。需要傳入文檔 ID（可通過 search_help_docs 或 list_help_docs 取得）。回傳文檔的標題、分類和 Markdown 格式的完整內容。',
    get_help_doc__parameters__properties__doc_id:
      '幫助文檔的唯一 ID（例如 "front-page"、"ai-models-guide"）',
    get_memory: '按 ID 取得已保存的記憶參考內容。',
    get_memory__parameters__properties__memory_id:
      'Memory ID（從 create_memory 或 search_memories 取得）',
    get_next_chapter:
      '取得指定章節的下一個章節資訊。用於查看下一個章節的標題、內容等，幫助理解上下文和保持翻譯一致性。章節內容按 limit/offset 分頁回傳（預設 30 段，最大 200），避免超長章節一次性塞滿上下文；需要更多內容時通過 offset 繼續讀取。',
    get_next_chapter__parameters__properties__chapter_id: '當前章節 ID',
    get_next_chapter__parameters__properties__include_memory:
      '是否在響應中包含相關的記憶資訊（預設 true）',
    get_next_chapter__parameters__properties__limit: '回傳的段落數量上限（預設 30，最大 200）。',
    get_next_chapter__parameters__properties__offset:
      '起始段落索引（0-based，預設 0）。配合 limit 翻頁讀取。',
    get_next_chapter__parameters__properties__summary_only:
      '如果為 true，則不回傳章節內容，只回傳所有的摘要資訊（預設為 false）',
    get_next_paragraphs:
      '取得指定段落之後的若干個段落。用於查看當前段落之後的上下文，幫助理解文本的連貫性。回傳的 paragraph_index 為展示序號（從 1 開始計數），chapter_index / volume_index 為數組索引（從 0 開始計數）。',
    get_next_paragraphs__parameters__properties__count: '要取得的段落數量（預設 3）',
    get_next_paragraphs__parameters__properties__include_memory:
      '是否在響應中包含相關的記憶資訊（預設 true）',
    get_next_paragraphs__parameters__properties__paragraph_id: '段落 ID（當前段落的 ID）',
    get_occurrences_by_keywords:
      '根據提供的關鍵詞取得其在書籍各章節中的出現次數。用於統計特定詞彙在文本中的分布情況，幫助理解詞彙的使用頻率和上下文。',
    get_occurrences_by_keywords__parameters__properties__keywords:
      '關鍵詞數組，可以包含一個或多個關鍵詞',
    get_paragraph_info:
      '取得段落的詳細資訊，包括原文、所有翻譯版本、選中的翻譯等。當需要瞭解當前段落的完整資訊時使用此工具。回傳的 paragraphIndex 為展示序號（從 1 開始計數），chapterIndex / volumeIndex 為數組索引（從 0 開始計數）。',
    get_paragraph_info__parameters__properties__include_memory:
      '是否在響應中包含相關的記憶資訊（預設 true）',
    get_paragraph_info__parameters__properties__paragraph_id: '段落 ID',
    get_paragraph_position:
      '取得段落在章節中的位置資訊，包括段落在章節中的索引、章節中段落的總數，以及可選的前後段落。用於瞭解當前段落在章節中的位置，方便進行上下文分析。',
    get_paragraph_position__parameters__properties__include_next:
      '是否包含後 x 個段落（預設 false）',
    get_paragraph_position__parameters__properties__include_previous:
      '是否包含前 x 個段落（預設 false）',
    get_paragraph_position__parameters__properties__next_count: '後段落數量（預設 3）',
    get_paragraph_position__parameters__properties__paragraph_id: '段落 ID',
    get_paragraph_position__parameters__properties__previous_count: '前段落數量（預設 3）',
    get_previous_chapter:
      '取得指定章節的前一個章節資訊。用於查看前一個章節的標題、內容等，幫助理解上下文和保持翻譯一致性。章節內容按 limit/offset 分頁回傳（預設 30 段，最大 200），避免超長章節一次性塞滿上下文；需要更多內容時通過 offset 繼續讀取。',
    get_previous_chapter__parameters__properties__chapter_id: '當前章節 ID',
    get_previous_chapter__parameters__properties__include_memory:
      '是否在響應中包含相關的記憶資訊（預設 true）',
    get_previous_chapter__parameters__properties__limit:
      '回傳的段落數量上限（預設 30，最大 200）。',
    get_previous_chapter__parameters__properties__offset:
      '起始段落索引（0-based，預設 0）。配合 limit 翻頁讀取。',
    get_previous_chapter__parameters__properties__summary_only:
      '如果為 true，則不回傳章節內容，只回傳所有的摘要資訊（預設為 false）',
    get_previous_paragraphs:
      '取得指定段落之前的若干個段落。用於查看當前段落之前的上下文，幫助理解文本的連貫性。回傳的 paragraph_index 為展示序號（從 1 開始計數），chapter_index / volume_index 為數組索引（從 0 開始計數）。',
    get_previous_paragraphs__parameters__properties__count: '要取得的段落數量（預設 3）',
    get_previous_paragraphs__parameters__properties__include_memory:
      '是否在響應中包含相關的記憶資訊（預設 true）',
    get_previous_paragraphs__parameters__properties__paragraph_id: '段落 ID（當前段落的 ID）',
    get_term:
      '根據術語名稱取得術語資訊。在翻譯過程中，如果遇到已存在的術語，可以使用此工具查詢其翻譯。[注意] **極重要**：如果名稱無法精確匹配，該工具會自動在後台對術語的原名、翻譯文本記錄進行模糊搜尋和部分匹配，並回傳最相關的結果列表。[警告] **重要**：查詢術語資訊時，必須**先**使用此工具或 search_terms_by_keywords 查詢術語資料庫，**只有在資料庫中沒有找到時**才可以使用 search_memories 搜尋記憶。',
    get_term__parameters__properties__include_memory: '是否在響應中包含相關的記憶資訊（預設 true）',
    get_term__parameters__properties__name: '術語名稱（原文）',
    get_translation_history:
      '取得段落的完整翻譯歷史。回傳該段落的所有翻譯版本，包括翻譯ID、翻譯內容、使用的AI模型等資訊。用於查看段落的翻譯歷史記錄。',
    get_translation_history__parameters__properties__include_memory:
      '是否在響應中包含相關的記憶資訊（預設 true）',
    get_translation_history__parameters__properties__paragraph_id: '段落 ID',
    list_chapters:
      '取得書籍的所有章節列表，包括每個章節的 ID、原文標題、翻譯標題。當需要查看所有可用章節並選擇參考章節時使用此工具。支持分頁（offset/limit）。如需按語義查找相關章節,請用 query_chapter。',
    list_chapters_by_volume:
      '取得按卷分組的書籍章節列表。當需要瞭解書籍的分卷結構、按卷查找章節或查看每卷包含的章節詳情時使用此工具。回傳結果包含卷資訊和該卷下的章節列表（含ID、標題、摘要）。',
    list_chapters_by_volume__parameters__properties__volume_ids: '要取得章節的卷 ID 列表',
    list_chapters__parameters__properties__limit: '可選，限制回傳的章節數量（預設回傳所有章節）',
    list_chapters__parameters__properties__offset: '可選，跳過的章節數量（用於分頁，預設為 0）',
    list_characters:
      '列出角色設定。可以通過 chapter_id 參數指定章節（只回傳該章節中出現的角色），或設置 all_chapters=true 列出所有章節的角色。如果不提供 chapter_id 且 all_chapters 為 false，則回傳所有角色。在翻譯開始前，可以使用此工具取得相關角色，以便在翻譯時保持一致性。',
    list_characters__parameters__properties__all_chapters:
      '是否列出所有章節的角色（預設 false）。如果為 true，忽略 chapter_id 參數，回傳所有角色。',
    list_characters__parameters__properties__chapter_id:
      '章節 ID（可選）。如果提供，只回傳在該章節中出現的角色。如果不提供且 all_chapters 為 false，則回傳所有角色。',
    list_characters__parameters__properties__limit: '回傳的角色數量限制（可選，預設回傳所有）',
    list_help_docs:
      '列出所有可用的幫助文檔，按類別分組。當使用者想瞭解有哪些幫助文檔可用，或需要瀏覽幫助目錄時使用此工具。',
    list_memories:
      '列出指定書籍的 Memory 列表（用於管理/調試）。支持分頁與排序，預設僅回傳輕量字段（id/summary/createdAt/lastAccessedAt）。如需完整內容，請設置 include_content=true。',
    list_memories__parameters__properties__include_content:
      '是否回傳完整內容 content（預設 false）',
    list_memories__parameters__properties__limit: '回傳數量（預設 20，建議不超過 50）',
    list_memories__parameters__properties__offset: '分頁偏移量（從 0 開始）',
    list_memories__parameters__properties__sort_by:
      '排序方式：createdAt 按建立時間（最新在前），lastAccessedAt 按最後訪問時間（預設）',
    list_terms:
      '列出術語。可以通過 chapter_id 參數指定章節（只回傳該章節中出現的術語），或設置 all_chapters=true 列出所有章節的術語。如果不提供 chapter_id 且 all_chapters 為 false，則回傳所有術語。在翻譯開始前，可以使用此工具取得相關術語，以便在翻譯時保持一致性。',
    list_terms__parameters__properties__all_chapters:
      '是否列出所有章節的術語（預設 false）。如果為 true，忽略 chapter_id 參數，回傳所有術語。',
    list_terms__parameters__properties__chapter_id:
      '章節 ID（可選）。如果提供，只回傳在該章節中出現的術語。如果不提供且 all_chapters 為 false，則回傳所有術語。',
    list_terms__parameters__properties__limit: '回傳的術語數量限制（可選，預設回傳所有）',
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
    navigate_to_chapter:
      '導航到指定的章節。將使用者界面跳轉到書籍詳情頁面並選中指定的章節。當使用者需要查看或編輯特定章節時使用此工具。',
    navigate_to_chapter__parameters__properties__chapter_id: '要導航到的章節 ID',
    navigate_to_help_doc:
      '導航到指定的幫助文檔頁面。將使用者界面跳轉到幫助中心並打開指定的文檔，可選定位到文檔內的具體章節。當使用者詢問使用方法後需要查看完整文檔，或需要引導使用者前往相關幫助頁面時使用此工具。',
    navigate_to_help_doc__parameters__properties__doc_id:
      '幫助文檔的唯一 ID（例如 "front-page"、"ai-models-guide"），可通過 search_help_docs 或 list_help_docs 取得',
    navigate_to_help_doc__parameters__properties__section_id:
      '可選的文檔章節錨點 ID，從文檔資源取得；界面語言切換後仍保留此標識。',
    navigate_to_paragraph:
      '導航到指定的段落。將使用者界面跳轉到書籍詳情頁面，選中包含該段落的章節，並滾動到該段落。當使用者需要查看或編輯特定段落時使用此工具。',
    navigate_to_paragraph__parameters__properties__paragraph_id: '要導航到的段落 ID',
    query_chapter:
      '混合檢索章節：語義、標題/正文關鍵詞、稀有詞 IDF 與章號/卷號 identifier 加權。回傳章節 ID、標題、得分及前200字預覽，需要全文時用 get_chapter_info。本地嵌入未就緒時回傳結構化錯誤，稍後重試。優先使用原始標題或系列詞、人物身份加具體動作及獨特細節、事件錨點；避免抽象讀後感、僅人名無動作或不存在的系列詞。轉述與原始標題字面差異大時優先原文標題詞或強錨點。結果為候選，預設看 Top3-5，不確定時 limit 8-10。已維護的原名與目標譯名可跨語言歸一，沒有記錄時使用原名。',
    query_chapter__parameters__properties__limit:
      '預設 5。Top1 未必最佳 — 把它當候選定位器,預設看 Top3-5;抽象 / 不確定時調到 8-10,再用 get_chapter_info 二次確認',
    query_chapter__parameters__properties__query:
      '任意語言的自然語言查詢。優先原始標題/系列詞、人物加具體動作細節或事件錨點，避免抽象讀後感或僅人名無動作。已維護的名稱可跨語言歸一，原文標題詞通常是更強錨點。',
    remove_translation:
      '刪除執行目標語言的指定版本；刪除選用時優先選同語言最新存活版本，不得選用其他語言。',
    remove_translation__parameters__properties__paragraph_id: '段落 ID',
    remove_translation__parameters__properties__translation_id:
      '要刪除的翻譯 ID（必須是該段落翻譯歷史中存在的翻譯ID）',
    search_characters_by_keywords:
      '根據多個關鍵詞搜尋角色。可以搜尋角色主名稱、別名或翻譯。支持多個關鍵詞，回傳包含任一關鍵詞的角色（OR 邏輯）。支持可選參數 translationOnly 只回傳有翻譯的角色。[警告] **重要**：查詢角色資訊時，必須**先**使用此工具或 get_character 查詢角色資料庫，**只有在資料庫中沒有找到時**才可以使用 search_memories 搜尋記憶。',
    search_characters_by_keywords__parameters__properties__include_memory:
      '是否在響應中包含相關的記憶資訊（預設 true）',
    search_characters_by_keywords__parameters__properties__keywords:
      '搜尋關鍵詞數組（回傳包含任一關鍵詞的角色）',
    search_characters_by_keywords__parameters__properties__translation_only:
      '是否只回傳有翻譯的角色（預設 false）',
    search_help_docs:
      '根據關鍵詞搜尋應用的幫助文檔。在標題和描述中進行模糊匹配。當使用者詢問應用的使用方法、功能介紹、操作指南等問題時，使用此工具搜尋相關幫助文檔。',
    search_help_docs__parameters__properties__query: '搜尋關鍵詞，可以是功能名稱、操作描述等',
    search_memories:
      '用自然語言混合關鍵詞與語義搜尋共享記憶。查詢角色/術語前先用 get_character/search_characters_by_keywords 或 get_term/search_terms_by_keywords 查詢資料庫，無記錄時再查記憶。記憶補充結構化資料，不替代資料庫。處理實際日語敬語時先查已有稱呼約定，再用 find_paragraph_by_keywords 查歷史。',
    search_memories__parameters__properties__query:
      '搜尋查詢（自然語言描述或關鍵詞，用於關鍵詞匹配和語義檢索）',
    search_paragraphs_by_regex:
      '使用正則表達式搜尋段落。支持在原文或翻譯文本中搜尋，可以匹配複雜的文本模式。用於查找符合特定模式的段落，例如查找包含特定格式的文本、數字模式、特定字元組合等。回傳的 paragraph_index 為展示序號（從 1 開始計數），chapter_index / volume_index 為數組索引（從 0 開始計數）。',
    search_paragraphs_by_regex__parameters__properties__chapter_id:
      '可選的章節 ID，如果提供則僅在該章節內搜尋（不搜尋其他章節）',
    search_paragraphs_by_regex__parameters__properties__max_paragraphs:
      '可選的最大回傳段落數量（預設 1）',
    search_paragraphs_by_regex__parameters__properties__only_with_translation:
      '是否只回傳有翻譯的段落（預設 false）。當設置為 true 時，只回傳已翻譯的段落。',
    search_paragraphs_by_regex__parameters__properties__regex_pattern:
      '正則表達式模式（字串格式）。例如："\\d+年" 匹配包含數字和"年"的文本，"[あ-ん]+" 匹配平假名等。',
    search_paragraphs_by_regex__parameters__properties__search_in_translation:
      '是否在翻譯文本中搜尋（預設 false）。當設置為 true 時，在翻譯文本中搜尋；當設置為 false 時，在原文中搜尋。',
    search_terms_by_keywords:
      '根據多個關鍵詞搜尋術語。可以搜尋術語名稱或翻譯。支持多個關鍵詞，回傳包含任一關鍵詞的術語（OR 邏輯）。支持可選參數 translationOnly 只回傳有翻譯的術語。[警告] **重要**：查詢術語資訊時，必須**先**使用此工具或 get_term 查詢術語資料庫，**只有在資料庫中沒有找到時**才可以使用 search_memories 搜尋記憶。',
    search_terms_by_keywords__parameters__properties__include_memory:
      '是否在響應中包含相關的記憶資訊（預設 true）',
    search_terms_by_keywords__parameters__properties__keywords:
      '搜尋關鍵詞數組（回傳包含任一關鍵詞的術語）',
    search_terms_by_keywords__parameters__properties__translation_only:
      '是否只回傳有翻譯的術語（預設 false）',
    search_web:
      '搜尋網絡以取得最新資訊或回答一般性問題。當使用者詢問需要最新資訊、實時資料或超出 AI 模型訓練資料範圍的問題時，可以使用此工具。[警告] 重要：當工具回傳 results 數組時，必須仔細閱讀每個結果的 title 和 snippet，從中提取關鍵資訊來回答使用者的問題。如果回傳了 answer 字段，直接使用該答案。只有在搜尋失敗（success: false）時才使用 AI 的內置知識庫。',
    search_web__parameters__properties__query: '搜尋查詢關鍵詞或問題',
    select_translation: '選用該段落屬於執行目標語言的版本，不能選用其他語言版本。',
    select_translation__parameters__properties__paragraph_id: '段落 ID',
    select_translation__parameters__properties__translation_id:
      '要選擇的翻譯 ID（必須是該段落翻譯歷史中存在的翻譯ID）',
    update_book_info:
      '更新書籍的基本資訊，包括描述、標籤、作者、別名等。可以同時更新多個字段，也可以只更新單個字段。用於完善書籍元資料、修正錯誤資訊或根據使用者需求調整書籍資訊。',
    update_book_info__parameters__properties__alternate_titles:
      '別名數組（可選，如果提供則更新別名）',
    update_book_info__parameters__properties__author:
      '作者名稱（可選，如果提供則更新作者，如果為空字串則清除作者）',
    update_book_info__parameters__properties__description:
      '書籍描述（可選，如果提供則更新描述，如果為空字串則清除描述）',
    update_book_info__parameters__properties__tags: '書籍標籤數組（可選，如果提供則更新標籤）',
    update_chapter_title:
      '更新章節的標題。可以更新原文標題（title_original）或翻譯標題（title_translation）。用於修正章節標題翻譯或更新原文標題。',
    update_chapter_title__parameters__properties__chapter_id: '章節 ID',
    update_chapter_title__parameters__properties__title_original:
      '新的原文標題（可選，如果提供則更新原文標題）',
    update_chapter_title__parameters__properties__title_translation:
      '新的翻譯標題（可選，如果提供則更新翻譯標題）',
    update_character:
      '更新現有角色的翻譯、描述、性別或別名。[警告] **重要**：當發現角色的資訊需要修正時（如格式錯誤、翻譯錯誤、描述格式不符合要求等），**必須**使用此工具進行更新，而不是僅僅告訴使用者問題所在。在更新別名時，必須確保提供的別名數組只包含該角色自己的別名，不能包含其他角色的名稱或別名。在更新前，應使用 list_characters 或 get_character 工具檢查每個別名是否屬於其他角色。[禁止] **錯誤處理**：如果嘗試添加的別名已屬於其他角色（作為其他角色的主名稱或別名），該別名將被**靜默跳過**，不會添加到當前角色，也不會拋出錯誤。因此必須在更新前檢查所有別名，避免無效操作。',
    update_character__parameters__properties__aliases:
      '替換別名數組（可選）。保留已有別名的穩定 ID，僅包含當前角色的別名；更新前用 list_characters 檢查歸屬。屬於其他角色主名或別名的衝突項會被靜默跳過，不會出現在結果中。',
    update_character__parameters__properties__aliases__items__properties__id:
      '已有別名的穩定 ID；改名時必須保留。新增別名省略。',
    update_character__parameters__properties__aliases__items__properties__name: '別名名稱（原文）',
    update_character__parameters__properties__aliases__items__properties__translation:
      '別名的目標語言譯文',
    update_character__parameters__properties__character_id:
      '角色 ID（從 get_character 或 list_characters 取得）',
    update_character__parameters__properties__description:
      '新的描述（可選，設置為空字串可刪除描述）。[警告] **重要**：描述應該簡短，只包含重要資訊，避免冗長或不必要的細節。',
    update_character__parameters__properties__name:
      '新的角色原名（可選）。已知全名時使用全名，不得補全未知部分。',
    update_character__parameters__properties__sex: '新的性別（可選）',
    update_character__parameters__properties__speaking_style:
      '新的說話口吻（可選，設置為空字串可刪除口吻）',
    update_character__parameters__properties__translation: '新的翻譯文本（可選）',
    update_memory:
      '更新指定的 Memory 記錄（推薦）。當發現新資訊或需要修正時，優先把新舊資訊合併成更短、更清晰、可復用的規則/約定；避免重復建立多條相似記憶。summary 請保留可檢索關鍵詞，content 用少量要點表達。',
    update_memory__parameters__properties__content: '更新後的實際內容',
    update_memory__parameters__properties__memory_id:
      'Memory ID（從 get_memory 或 search_memories 取得）',
    update_memory__parameters__properties__summary: '更新後的摘要（由 AI 生成，用於後續搜尋）',
    update_task_status:
      '更新當前 AI 任務的狀態。翻譯任務：planning(規劃中) → working(執行中) → review(復核中) → end(完成)；潤色/校對任務：planning → working → end。注意：翻譯任務支持 review → working 回傳修改。',
    update_task_status__parameters__properties__reason: '狀態變更的原因（可選）',
    update_task_status__parameters__properties__status:
      '新的任務狀態。planning: 正在規劃並維護術語/角色/記憶；working: 正在執行翻譯/潤色/校對；review: 正在復核（僅翻譯任務可用）；end: 任務完成',
    update_term:
      '更新現有術語的翻譯或描述。[警告] **重要**：當發現術語的翻譯需要修正時（如翻譯錯誤、格式錯誤等），**必須**使用此工具進行更新，而不是僅僅告訴使用者問題所在。',
    update_term__parameters__properties__description:
      '新的描述（可選，設置為空字串可刪除描述）。[警告] **重要**：描述應該簡短，只包含重要資訊，避免冗長或不必要的細節。',
    update_term__parameters__properties__term_id: '術語 ID（從 get_term 或 list_terms 取得）',
    update_term__parameters__properties__translation:
      '新的翻譯文本（可選）。[警告] **重要**：每個術語只能有一個翻譯，不要使用多個翻譯（如"路人角色／龍套"），應選擇一個最合適的翻譯（如"龍套"）。如果發現現有翻譯包含多個選項，必須更新為單一翻譯。',
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
    update_translation:
      '修改該段落屬於執行目標語言的指定版本，保留 ID 與 AI 模型資訊；其他語言版本拒絕修改。',
    update_translation__parameters__properties__new_translation: '新的翻譯內容',
    update_translation__parameters__properties__paragraph_id: '段落 ID',
    update_translation__parameters__properties__translation_id:
      '要更新的翻譯 ID（必須是該段落翻譯歷史中存在的翻譯ID）',
  },
};
