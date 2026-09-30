export default {
  aiTools: {
    create_term:
      '创建术语记录。仅用于作品特定、上下文相关或需要特殊处理的术语，不为通用词汇或已有固定词典译法的词创建记录。原名与目标译名相同时，仅在作品中有特殊上下文含义需要说明时创建。每个术语只保留一个目标译名。',
    create_term__parameters__properties__name: '术语名称（原文）',
    create_term__parameters__properties__translation:
      '术语的目标语言译文。[警告] **重要**：每个术语只能有一个翻译，不要使用多个翻译（如"路人角色／龙套"），应选择一个最合适的翻译（如"龙套"）。',
    create_term__parameters__properties__description:
      '术语的简短描述（可选）。[警告] **重要**：描述应该简短，只包含重要信息，避免冗长或不必要的细节。',
    get_term:
      '根据术语名称获取术语信息。在翻译过程中，如果遇到已存在的术语，可以使用此工具查询其翻译。[注意] **极重要**：如果名称无法精确匹配，该工具会自动在后台对术语的原名、翻译文本记录进行模糊搜索和部分匹配，并返回最相关的结果列表。[警告] **重要**：查询术语信息时，必须**先**使用此工具或 search_terms_by_keywords 查询术语数据库，**只有在数据库中没有找到时**才可以使用 search_memories 搜索记忆。',
    get_term__parameters__properties__name: '术语名称（原文）',
    get_term__parameters__properties__include_memory: '是否在响应中包含相关的记忆信息（默认 true）',
    update_term:
      '更新现有术语的翻译或描述。[警告] **重要**：当发现术语的翻译需要修正时（如翻译错误、格式错误等），**必须**使用此工具进行更新，而不是仅仅告诉用户问题所在。',
    update_term__parameters__properties__term_id: '术语 ID（从 get_term 或 list_terms 获取）',
    update_term__parameters__properties__translation:
      '新的翻译文本（可选）。[警告] **重要**：每个术语只能有一个翻译，不要使用多个翻译（如"路人角色／龙套"），应选择一个最合适的翻译（如"龙套"）。如果发现现有翻译包含多个选项，必须更新为单一翻译。',
    update_term__parameters__properties__description:
      '新的描述（可选，设置为空字符串可删除描述）。[警告] **重要**：描述应该简短，只包含重要信息，避免冗长或不必要的细节。',
    delete_term: '删除术语。当确定某个术语不再需要时，可以使用此工具删除。',
    delete_term__parameters__properties__term_id: '术语 ID（从 get_term 或 list_terms 获取）',
    list_terms:
      '列出术语。可以通过 chapter_id 参数指定章节（只返回该章节中出现的术语），或设置 all_chapters=true 列出所有章节的术语。如果不提供 chapter_id 且 all_chapters 为 false，则返回所有术语。在翻译开始前，可以使用此工具获取相关术语，以便在翻译时保持一致性。',
    list_terms__parameters__properties__chapter_id:
      '章节 ID（可选）。如果提供，只返回在该章节中出现的术语。如果不提供且 all_chapters 为 false，则返回所有术语。',
    list_terms__parameters__properties__all_chapters:
      '是否列出所有章节的术语（默认 false）。如果为 true，忽略 chapter_id 参数，返回所有术语。',
    list_terms__parameters__properties__limit: '返回的术语数量限制（可选，默认返回所有）',
    search_terms_by_keywords:
      '根据多个关键词搜索术语。可以搜索术语名称或翻译。支持多个关键词，返回包含任一关键词的术语（OR 逻辑）。支持可选参数 translationOnly 只返回有翻译的术语。[警告] **重要**：查询术语信息时，必须**先**使用此工具或 get_term 查询术语数据库，**只有在数据库中没有找到时**才可以使用 search_memories 搜索记忆。',
    search_terms_by_keywords__parameters__properties__keywords:
      '搜索关键词数组（返回包含任一关键词的术语）',
    search_terms_by_keywords__parameters__properties__translation_only:
      '是否只返回有翻译的术语（默认 false）',
    search_terms_by_keywords__parameters__properties__include_memory:
      '是否在响应中包含相关的记忆信息（默认 true）',
    get_occurrences_by_keywords:
      '根据提供的关键词获取其在书籍各章节中的出现次数。用于统计特定词汇在文本中的分布情况，帮助理解词汇的使用频率和上下文。',
    get_occurrences_by_keywords__parameters__properties__keywords:
      '关键词数组，可以包含一个或多个关键词',
    create_character:
      "创建新角色设定。[警告] 重要：在创建新角色之前，必须使用 list_characters 或 get_character 工具检查该角色是否已存在，或者是否应该是已存在角色的别名。如果发现该角色实际上是已存在角色的别名，应该使用 update_character 工具将新名称添加为别名，而不是创建新角色。[禁止] **错误处理**：如果尝试创建的角色名称已存在（作为其他角色的主名称），将抛出错误 \"角色 {'{'}name{'}'} 已存在\"，操作将失败。",
    create_character__parameters__properties__name:
      '角色原名，来源语言不限。已知全名时使用全名，不仅用姓或名；不得凭空补全未知的姓名部分。',
    create_character__parameters__properties__translation: '角色全名的执行目标语言译名。',
    create_character__parameters__properties__sex: '角色性别（可选）',
    create_character__parameters__properties__description:
      '角色的简短描述（可选）。[警告] **重要**：描述应该简短，只包含重要信息，避免冗长或不必要的细节。',
    create_character__parameters__properties__speaking_style:
      '角色的说话口吻（可选）。例如：粗鲁、古风、口癖(desu/nya)等',
    create_character__parameters__properties__aliases__items__properties__id:
      '已有别名的稳定 ID；改名时必须保留。新增别名省略。',
    create_character__parameters__properties__aliases__items__properties__name:
      '来源语言不限的原始别名，通常为已知的姓或名。',
    create_character__parameters__properties__aliases__items__properties__translation:
      '别名的目标语言译文',
    create_character__parameters__properties__aliases:
      '角色别名数组（可选），包含已知姓或名。不得自动生成带敬语的别名。',
    get_character:
      '根据角色名称获取角色信息。在翻译过程中，如果遇到已存在的角色，可以使用此工具查询其翻译和设定。[注意] **极重要**：如果名称无法精确匹配，该工具会自动在后台对角色的原名、翻译文本记录以及全部已收录的别名进行模糊搜索和部分匹配，并返回最相关的结果列表。[警告] **重要**：查询角色信息时，必须**先**使用此工具或 search_characters_by_keywords 查询角色数据库，**只有在数据库中没有找到时**才可以使用 search_memories 搜索记忆。',
    get_character__parameters__properties__name: '角色名称（原文）',
    get_character__parameters__properties__include_memory:
      '是否在响应中包含相关的记忆信息（默认 true）',
    update_character:
      '更新现有角色的翻译、描述、性别或别名。[警告] **重要**：当发现角色的信息需要修正时（如格式错误、翻译错误、描述格式不符合要求等），**必须**使用此工具进行更新，而不是仅仅告诉用户问题所在。在更新别名时，必须确保提供的别名数组只包含该角色自己的别名，不能包含其他角色的名称或别名。在更新前，应使用 list_characters 或 get_character 工具检查每个别名是否属于其他角色。[禁止] **错误处理**：如果尝试添加的别名已属于其他角色（作为其他角色的主名称或别名），该别名将被**静默跳过**，不会添加到当前角色，也不会抛出错误。因此必须在更新前检查所有别名，避免无效操作。',
    update_character__parameters__properties__character_id:
      '角色 ID（从 get_character 或 list_characters 获取）',
    update_character__parameters__properties__name:
      '新的角色原名（可选）。已知全名时使用全名，不得补全未知部分。',
    update_character__parameters__properties__translation: '新的翻译文本（可选）',
    update_character__parameters__properties__sex: '新的性别（可选）',
    update_character__parameters__properties__description:
      '新的描述（可选，设置为空字符串可删除描述）。[警告] **重要**：描述应该简短，只包含重要信息，避免冗长或不必要的细节。',
    update_character__parameters__properties__speaking_style:
      '新的说话口吻（可选，设置为空字符串可删除口吻）',
    update_character__parameters__properties__aliases__items__properties__id:
      '已有别名的稳定 ID；改名时必须保留。新增别名省略。',
    update_character__parameters__properties__aliases__items__properties__name: '别名名称（原文）',
    update_character__parameters__properties__aliases__items__properties__translation:
      '别名的目标语言译文',
    update_character__parameters__properties__aliases:
      '替换别名数组（可选）。保留已有别名的稳定 ID，仅包含当前角色的别名；更新前用 list_characters 检查归属。属于其他角色主名或别名的冲突项会被静默跳过，不会出现在结果中。',
    delete_character: '删除角色设定。当确定某个角色不再需要时，可以使用此工具删除。',
    delete_character__parameters__properties__character_id:
      '角色 ID（从 get_character 或 list_characters 获取）',
    search_characters_by_keywords:
      '根据多个关键词搜索角色。可以搜索角色主名称、别名或翻译。支持多个关键词，返回包含任一关键词的角色（OR 逻辑）。支持可选参数 translationOnly 只返回有翻译的角色。[警告] **重要**：查询角色信息时，必须**先**使用此工具或 get_character 查询角色数据库，**只有在数据库中没有找到时**才可以使用 search_memories 搜索记忆。',
    search_characters_by_keywords__parameters__properties__keywords:
      '搜索关键词数组（返回包含任一关键词的角色）',
    search_characters_by_keywords__parameters__properties__translation_only:
      '是否只返回有翻译的角色（默认 false）',
    search_characters_by_keywords__parameters__properties__include_memory:
      '是否在响应中包含相关的记忆信息（默认 true）',
    list_characters:
      '列出角色设定。可以通过 chapter_id 参数指定章节（只返回该章节中出现的角色），或设置 all_chapters=true 列出所有章节的角色。如果不提供 chapter_id 且 all_chapters 为 false，则返回所有角色。在翻译开始前，可以使用此工具获取相关角色，以便在翻译时保持一致性。',
    list_characters__parameters__properties__chapter_id:
      '章节 ID（可选）。如果提供，只返回在该章节中出现的角色。如果不提供且 all_chapters 为 false，则返回所有角色。',
    list_characters__parameters__properties__all_chapters:
      '是否列出所有章节的角色（默认 false）。如果为 true，忽略 chapter_id 参数，返回所有角色。',
    list_characters__parameters__properties__limit: '返回的角色数量限制（可选，默认返回所有）',
    get_paragraph_position:
      '获取段落在章节中的位置信息，包括段落在章节中的索引、章节中段落的总数，以及可选的前后段落。用于了解当前段落在章节中的位置，方便进行上下文分析。',
    get_paragraph_position__parameters__properties__paragraph_id: '段落 ID',
    get_paragraph_position__parameters__properties__include_previous:
      '是否包含前 x 个段落（默认 false）',
    get_paragraph_position__parameters__properties__include_next:
      '是否包含后 x 个段落（默认 false）',
    get_paragraph_position__parameters__properties__previous_count: '前段落数量（默认 3）',
    get_paragraph_position__parameters__properties__next_count: '后段落数量（默认 3）',
    get_paragraph_info:
      '获取段落的详细信息，包括原文、所有翻译版本、选中的翻译等。当需要了解当前段落的完整信息时使用此工具。返回的 paragraphIndex 为展示序号（从 1 开始计数），chapterIndex / volumeIndex 为数组索引（从 0 开始计数）。',
    get_paragraph_info__parameters__properties__paragraph_id: '段落 ID',
    get_paragraph_info__parameters__properties__include_memory:
      '是否在响应中包含相关的记忆信息（默认 true）',
    get_previous_paragraphs:
      '获取指定段落之前的若干个段落。用于查看当前段落之前的上下文，帮助理解文本的连贯性。返回的 paragraph_index 为展示序号（从 1 开始计数），chapter_index / volume_index 为数组索引（从 0 开始计数）。',
    get_previous_paragraphs__parameters__properties__paragraph_id: '段落 ID（当前段落的 ID）',
    get_previous_paragraphs__parameters__properties__count: '要获取的段落数量（默认 3）',
    get_previous_paragraphs__parameters__properties__include_memory:
      '是否在响应中包含相关的记忆信息（默认 true）',
    get_next_paragraphs:
      '获取指定段落之后的若干个段落。用于查看当前段落之后的上下文，帮助理解文本的连贯性。返回的 paragraph_index 为展示序号（从 1 开始计数），chapter_index / volume_index 为数组索引（从 0 开始计数）。',
    get_next_paragraphs__parameters__properties__paragraph_id: '段落 ID（当前段落的 ID）',
    get_next_paragraphs__parameters__properties__count: '要获取的段落数量（默认 3）',
    get_next_paragraphs__parameters__properties__include_memory:
      '是否在响应中包含相关的记忆信息（默认 true）',
    find_paragraph_by_keywords:
      '根据多个关键词查找包含任一关键词的段落。用于在翻译过程中查找特定内容或验证翻译的一致性。支持在原文或翻译文本中搜索，如果同时提供两者，则只返回同时满足两个条件的段落。支持多个关键词，返回包含任一关键词的段落（OR 逻辑）。[警告] **敬语翻译**：翻译敬语时，必须**首先**使用 search_memories 搜索记忆中关于该角色敬语翻译的相关信息，**然后**再使用此工具搜索该角色在之前段落中的翻译，以确保翻译一致性。如果提供 chapter_id 参数，则仅在指定章节内搜索；如果不提供，则搜索所有章节。返回的 paragraph_index 为展示序号（从 1 开始计数），chapter_index / volume_index 为数组索引（从 0 开始计数）。',
    find_paragraph_by_keywords__parameters__properties__keywords:
      '原文关键词数组（可选），用于在原文中搜索包含任一关键词的段落（OR 逻辑）。如果与 translation_keywords 同时提供，则段落必须同时满足两个条件。',
    find_paragraph_by_keywords__parameters__properties__translation_keywords:
      '翻译文本关键词数组（可选），用于在翻译文本中搜索包含任一关键词的段落（OR 逻辑）。如果与 keywords 同时提供，则段落必须同时满足两个条件。',
    find_paragraph_by_keywords__parameters__properties__chapter_id:
      '可选的章节 ID，如果提供则仅在该章节内搜索（不搜索其他章节）',
    find_paragraph_by_keywords__parameters__properties__max_paragraphs:
      '可选的最大返回段落数量（默认 1）',
    find_paragraph_by_keywords__parameters__properties__only_with_translation:
      '是否只返回有翻译的段落（默认 false）。当设置为 true 时，只返回已翻译的段落，用于查看之前如何翻译某个关键词，确保翻译一致性。',
    find_paragraph_by_keywords__parameters__properties__include_memory:
      '是否在响应中包含相关的记忆信息（默认 true）',
    search_paragraphs_by_regex:
      '使用正则表达式搜索段落。支持在原文或翻译文本中搜索，可以匹配复杂的文本模式。用于查找符合特定模式的段落，例如查找包含特定格式的文本、数字模式、特定字符组合等。返回的 paragraph_index 为展示序号（从 1 开始计数），chapter_index / volume_index 为数组索引（从 0 开始计数）。',
    search_paragraphs_by_regex__parameters__properties__regex_pattern:
      '正则表达式模式（字符串格式）。例如："\\d+年" 匹配包含数字和"年"的文本，"[あ-ん]+" 匹配平假名等。',
    search_paragraphs_by_regex__parameters__properties__chapter_id:
      '可选的章节 ID，如果提供则仅在该章节内搜索（不搜索其他章节）',
    search_paragraphs_by_regex__parameters__properties__max_paragraphs:
      '可选的最大返回段落数量（默认 1）',
    search_paragraphs_by_regex__parameters__properties__only_with_translation:
      '是否只返回有翻译的段落（默认 false）。当设置为 true 时，只返回已翻译的段落。',
    search_paragraphs_by_regex__parameters__properties__search_in_translation:
      '是否在翻译文本中搜索（默认 false）。当设置为 true 时，在翻译文本中搜索；当设置为 false 时，在原文中搜索。',
    get_translation_history:
      '获取段落的完整翻译历史。返回该段落的所有翻译版本，包括翻译ID、翻译内容、使用的AI模型等信息。用于查看段落的翻译历史记录。',
    get_translation_history__parameters__properties__paragraph_id: '段落 ID',
    get_translation_history__parameters__properties__include_memory:
      '是否在响应中包含相关的记忆信息（默认 true）',
    update_translation:
      '修改该段落属于执行目标语言的指定版本，保留 ID 与 AI 模型信息；其他语言版本拒绝修改。',
    update_translation__parameters__properties__paragraph_id: '段落 ID',
    update_translation__parameters__properties__translation_id:
      '要更新的翻译 ID（必须是该段落翻译历史中存在的翻译ID）',
    update_translation__parameters__properties__new_translation: '新的翻译内容',
    select_translation: '选用该段落属于执行目标语言的版本，不能选用其他语言版本。',
    select_translation__parameters__properties__paragraph_id: '段落 ID',
    select_translation__parameters__properties__translation_id:
      '要选择的翻译 ID（必须是该段落翻译历史中存在的翻译ID）',
    add_translation:
      '为执行目标语言添加译文版本，每种语言保留至多5个版本；必要时移除该语言最旧版本，其他语言保留。',
    add_translation__parameters__properties__paragraph_id: '段落 ID',
    add_translation__parameters__properties__translation: '新的翻译内容',
    add_translation__parameters__properties__ai_model_id:
      'AI 模型 ID（可选，如果不提供则使用当前默认模型）',
    add_translation__parameters__properties__set_as_selected:
      '是否将新翻译设置为当前选中的翻译（默认 true）',
    remove_translation:
      '删除执行目标语言的指定版本；删除选用时优先选同语言最新存活版本，不得选用其他语言。',
    remove_translation__parameters__properties__paragraph_id: '段落 ID',
    remove_translation__parameters__properties__translation_id:
      '要删除的翻译 ID（必须是该段落翻译历史中存在的翻译ID）',
    batch_replace_translations:
      '只替换执行目标语言选用译文中的匹配关键词，保留其余内容，不替换整段或其他语言/历史版本。同时提供原文和译文关键词时须满足两者；仅提供原文关键词时在目标译文中找对应关键词，未找到则跳过。',
    batch_replace_translations__parameters__properties__keywords:
      '关键词数组（可选），用于在翻译文本中搜索包含任一关键词的段落（OR 逻辑）。如果与 original_keywords 同时提供，则段落必须同时满足两个条件。',
    batch_replace_translations__parameters__properties__original_keywords:
      '原文关键词数组（可选），用于在原文中搜索包含任一关键词的段落（OR 逻辑）。如果与 keywords 同时提供，则段落必须同时满足两个条件。',
    batch_replace_translations__parameters__properties__replacement_text:
      '替换文本，用于替换匹配的关键词部分（不是替换整个翻译）。例如：如果关键词是"大姐"，替换文本是"姐姐"，则"大姐abc"会被替换为"姐姐abc"。如果只提供原文关键词（没有翻译关键词），工具会在翻译文本中查找对应的关键词进行替换；如果找不到匹配的关键词，则跳过该段落。',
    batch_replace_translations__parameters__properties__chapter_id:
      '可选的章节 ID，如果提供则仅在该章节内搜索和替换（不处理其他章节）',
    batch_replace_translations__parameters__properties__replace_all_translations:
      '兼容字段；始终只替换执行目标语言的选用版本，不扩大至全部历史。',
    batch_replace_translations__parameters__properties__max_replacements:
      '可选的最大替换数量（默认 100）。用于限制一次操作替换的段落数量，避免意外替换过多内容。',
    search_web:
      '搜索网络以获取最新信息或回答一般性问题。当用户询问需要最新信息、实时数据或超出 AI 模型训练数据范围的问题时，可以使用此工具。[警告] 重要：当工具返回 results 数组时，必须仔细阅读每个结果的 title 和 snippet，从中提取关键信息来回答用户的问题。如果返回了 answer 字段，直接使用该答案。只有在搜索失败（success: false）时才使用 AI 的内置知识库。',
    search_web__parameters__properties__query: '搜索查询关键词或问题',
    fetch_webpage:
      '直接访问指定的网页并提取其内容。当用户提供了具体的网页 URL 或需要查看特定网页的详细内容时使用此工具。工具会提取网页的标题和主要内容文本，供 AI 分析。[警告] 重要：使用此工具时，必须仔细阅读返回的 text 内容，从中提取关键信息来回答用户的问题。如果返回了 error，说明无法访问该网页。',
    fetch_webpage__parameters__properties__url:
      '要访问的网页 URL（必须是完整的 URL，包含 http:// 或 https://）',
    get_book_info:
      '获取当前书籍的详细信息，包括标题、作者、简介、标签、备注以及卷章结构摘要。当需要了解书籍背景、上下文或查看用户备注时使用此工具。',
    get_book_info__parameters__properties__include_memory:
      '是否在响应中包含相关的记忆信息（默认 true）',
    list_chapters:
      '获取书籍的所有章节列表，包括每个章节的 ID、原文标题、翻译标题。当需要查看所有可用章节并选择参考章节时使用此工具。支持分页（offset/limit）。如需按语义查找相关章节,请用 query_chapter。',
    list_chapters__parameters__properties__limit: '可选，限制返回的章节数量（默认返回所有章节）',
    list_chapters__parameters__properties__offset: '可选，跳过的章节数量（用于分页，默认为 0）',
    list_chapters_by_volume:
      '获取按卷分组的书籍章节列表。当需要了解书籍的分卷结构、按卷查找章节或查看每卷包含的章节详情时使用此工具。返回结果包含卷信息和该卷下的章节列表（含ID、标题、摘要）。',
    list_chapters_by_volume__parameters__properties__volume_ids: '要获取章节的卷 ID 列表',
    query_chapter:
      '混合检索章节：语义、标题/正文关键词、稀有词 IDF 与章号/卷号 identifier 加权。返回章节 ID、标题、得分及前200字预览，需要全文时用 get_chapter_info。本地嵌入未就绪时返回结构化错误，稍后重试。优先使用原始标题或系列词、人物身份加具体动作及独特细节、事件锚点；避免抽象读后感、仅人名无动作或不存在的系列词。转述与原始标题字面差异大时优先原文标题词或强锚点。结果为候选，默认看 Top3-5，不确定时 limit 8-10。已维护的原名与目标译名可跨语言归一，没有记录时使用原名。',
    query_chapter__parameters__properties__query:
      '任意语言的自然语言查询。优先原始标题/系列词、人物加具体动作细节或事件锚点，避免抽象读后感或仅人名无动作。已维护的名称可跨语言归一，原文标题词通常是更强锚点。',
    query_chapter__parameters__properties__limit:
      '默认 5。Top1 未必最佳 — 把它当候选定位器,默认看 Top3-5;抽象 / 不确定时调到 8-10,再用 get_chapter_info 二次确认',
    get_chapter_info:
      '获取章节的详细信息，包括标题、段落列表（默认分页）、翻译进度等。章节可能很长，返回内容会按 limit/offset 分页；先用小 limit 确认方向，需要更多段落再通过 offset 继续读取，避免一次性拉整章把上下文塞满。',
    get_chapter_info__parameters__properties__chapter_id: '章节 ID',
    get_chapter_info__parameters__properties__limit:
      '返回的段落数量上限（默认 30，最大 200）。章节可能有上百段，默认只取前 30 段避免 context 爆炸。',
    get_chapter_info__parameters__properties__offset:
      '起始段落索引（0-based，默认 0）。配合 limit 翻页读取。',
    get_chapter_info__parameters__properties__include_memory:
      '是否在响应中包含相关的记忆信息（默认 true）',
    get_previous_chapter:
      '获取指定章节的前一个章节信息。用于查看前一个章节的标题、内容等，帮助理解上下文和保持翻译一致性。章节内容按 limit/offset 分页返回（默认 30 段，最大 200），避免超长章节一次性塞满上下文；需要更多内容时通过 offset 继续读取。',
    get_previous_chapter__parameters__properties__chapter_id: '当前章节 ID',
    get_previous_chapter__parameters__properties__include_memory:
      '是否在响应中包含相关的记忆信息（默认 true）',
    get_previous_chapter__parameters__properties__summary_only:
      '如果为 true，则不返回章节内容，只返回所有的摘要信息（默认为 false）',
    get_previous_chapter__parameters__properties__limit:
      '返回的段落数量上限（默认 30，最大 200）。',
    get_previous_chapter__parameters__properties__offset:
      '起始段落索引（0-based，默认 0）。配合 limit 翻页读取。',
    get_next_chapter:
      '获取指定章节的下一个章节信息。用于查看下一个章节的标题、内容等，帮助理解上下文和保持翻译一致性。章节内容按 limit/offset 分页返回（默认 30 段，最大 200），避免超长章节一次性塞满上下文；需要更多内容时通过 offset 继续读取。',
    get_next_chapter__parameters__properties__chapter_id: '当前章节 ID',
    get_next_chapter__parameters__properties__include_memory:
      '是否在响应中包含相关的记忆信息（默认 true）',
    get_next_chapter__parameters__properties__summary_only:
      '如果为 true，则不返回章节内容，只返回所有的摘要信息（默认为 false）',
    get_next_chapter__parameters__properties__limit: '返回的段落数量上限（默认 30，最大 200）。',
    get_next_chapter__parameters__properties__offset:
      '起始段落索引（0-based，默认 0）。配合 limit 翻页读取。',
    update_chapter_title:
      '更新章节的标题。可以更新原文标题（title_original）或翻译标题（title_translation）。用于修正章节标题翻译或更新原文标题。',
    update_chapter_title__parameters__properties__chapter_id: '章节 ID',
    update_chapter_title__parameters__properties__title_original:
      '新的原文标题（可选，如果提供则更新原文标题）',
    update_chapter_title__parameters__properties__title_translation:
      '新的翻译标题（可选，如果提供则更新翻译标题）',
    update_book_info:
      '更新书籍的基本信息，包括描述、标签、作者、别名等。可以同时更新多个字段，也可以只更新单个字段。用于完善书籍元数据、修正错误信息或根据用户需求调整书籍信息。',
    update_book_info__parameters__properties__description:
      '书籍描述（可选，如果提供则更新描述，如果为空字符串则清除描述）',
    update_book_info__parameters__properties__tags: '书籍标签数组（可选，如果提供则更新标签）',
    update_book_info__parameters__properties__author:
      '作者名称（可选，如果提供则更新作者，如果为空字符串则清除作者）',
    update_book_info__parameters__properties__alternate_titles:
      '别名数组（可选，如果提供则更新别名）',
    list_memories:
      '列出指定书籍的 Memory 列表（用于管理/调试）。支持分页与排序，默认仅返回轻量字段（id/summary/createdAt/lastAccessedAt）。如需完整内容，请设置 include_content=true。',
    list_memories__parameters__properties__offset: '分页偏移量（从 0 开始）',
    list_memories__parameters__properties__limit: '返回数量（默认 20，建议不超过 50）',
    list_memories__parameters__properties__sort_by:
      '排序方式：createdAt 按创建时间（最新在前），lastAccessedAt 按最后访问时间（默认）',
    list_memories__parameters__properties__include_content:
      '是否返回完整内容 content（默认 false）',
    get_memory: '按 ID 获取已保存的记忆参考内容。',
    get_memory__parameters__properties__memory_id:
      'Memory ID（从 create_memory 或 search_memories 获取）',
    search_memories:
      '用自然语言混合关键词与语义搜索共享记忆。查询角色/术语前先用 get_character/search_characters_by_keywords 或 get_term/search_terms_by_keywords 查询数据库，无记录时再查记忆。记忆补充结构化资料，不替代数据库。处理实际日语敬语时先查已有称呼约定，再用 find_paragraph_by_keywords 查历史。',
    search_memories__parameters__properties__query:
      '搜索查询（自然语言描述或关键词，用于关键词匹配和语义检索）',
    create_memory:
      '仅在没有相关已有记忆可合并更新时创建。优先用 update_memory，将每条记忆限定为一个可复用的翻译决定：称呼、术语或文风。summary 是高权重检索标题，应包含相关原名、目标译名、别名与同义表达，以 / 分隔；content 用少量要点。避免重复记录。',
    create_memory__parameters__properties__content: '要存储的实际内容（少量要点）',
    create_memory__parameters__properties__summary:
      '摘要/检索标题。包含可检索的原名、目标译名、别名、俗称和同义表达，以 / 分隔；摘要命中权重远高于 content。',
    update_memory:
      '更新指定的 Memory 记录（推荐）。当发现新信息或需要修正时，优先把新旧信息合并成更短、更清晰、可复用的规则/约定；避免重复创建多条相似记忆。summary 请保留可检索关键词，content 用少量要点表达。',
    update_memory__parameters__properties__memory_id:
      'Memory ID（从 get_memory 或 search_memories 获取）',
    update_memory__parameters__properties__content: '更新后的实际内容',
    update_memory__parameters__properties__summary: '更新后的摘要（由 AI 生成，用于后续搜索）',
    delete_memory: '删除指定的 Memory 记录。当确定某个 Memory 不再需要时，可以使用此工具删除。',
    delete_memory__parameters__properties__memory_id:
      'Memory ID（从 get_memory 或 search_memories 获取）',
    navigate_to_chapter:
      '导航到指定的章节。将用户界面跳转到书籍详情页面并选中指定的章节。当用户需要查看或编辑特定章节时使用此工具。',
    navigate_to_chapter__parameters__properties__chapter_id: '要导航到的章节 ID',
    navigate_to_paragraph:
      '导航到指定的段落。将用户界面跳转到书籍详情页面，选中包含该段落的章节，并滚动到该段落。当用户需要查看或编辑特定段落时使用此工具。',
    navigate_to_paragraph__parameters__properties__paragraph_id: '要导航到的段落 ID',
    create_todo:
      '创建新的待办事项。可以创建单个待办事项（使用 text 参数）或多个待办事项（使用 items 参数）。当用户要求添加任务或待办事项时使用此工具。[警告] 重要：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，而不是高层次的总结。如果你规划了一个包含多个步骤的任务，必须为每个步骤创建一个独立的待办事项。',
    create_todo__parameters__properties__text:
      '单个待办事项的内容描述（与 items 参数二选一）。[警告] 重要：必须提供详细、具体、可执行的描述，而不是总结性的描述。例如："翻译第1-5段，检查术语一致性" 而不是 "翻译文本"。',
    create_todo__parameters__properties__items:
      '多个待办事项的内容列表（与 text 参数二选一）。用于批量创建多个待办事项。[警告] 重要：每个待办事项必须提供详细、具体、可执行的描述，而不是总结性的描述。例如：["翻译第1-5段，检查术语一致性", "翻译第6-10段，确保角色名称翻译一致"] 而不是 ["翻译文本", "检查一致性"]。',
    update_todos:
      '更新待办事项的内容或状态。可以更新单个待办事项（使用 id 参数）或多个待办事项（使用 items 参数）。可以更新文本内容或状态。',
    update_todos__parameters__properties__id: '单个待办事项的 ID（与 items 参数二选一）',
    update_todos__parameters__properties__text: '新的待办事项内容（可选，仅当使用 id 参数时有效）',
    update_todos__parameters__properties__status:
      '新的待办事项状态（可选，仅当使用 id 参数时有效）',
    update_todos__parameters__properties__items__items__properties__id: '待办事项的 ID',
    update_todos__parameters__properties__items__items__properties__text:
      '新的待办事项内容（可选）',
    update_todos__parameters__properties__items__items__properties__status:
      '新的待办事项状态（可选）',
    update_todos__parameters__properties__items:
      '多个待办事项的更新列表（与 id 参数二选一）。用于批量更新多个待办事项。',
    mark_todo_done:
      '将待办事项标记为完成。无需先标记进行中。完成多项时用 ids 一次性批量标记，避免逐条调用。标记完成后，系统会自动把下一项待办标记为进行中。',
    mark_todo_done__parameters__properties__id: '单个待办事项的 ID（与 ids 二选一）',
    mark_todo_done__parameters__properties__ids:
      '多个待办事项的 ID 列表（与 id 二选一）。一次性标记多项时优先使用。',
    mark_todo_working:
      '将待办事项标记为进行中。通常无需调用：完成/创建待办后系统会自动把下一项标记为进行中；仅在需要手动切换当前进行项时使用。',
    mark_todo_working__parameters__properties__id: '单个待办事项的 ID（与 ids 二选一）',
    mark_todo_working__parameters__properties__ids:
      '多个待办事项的 ID 列表（与 id 二选一）。一次性标记多项时优先使用。',
    delete_todo: '删除待办事项。',
    delete_todo__parameters__properties__id: '待办事项的 ID',
    list_todos:
      '列出当前任务的待办事项列表。返回当前任务关联的所有待办事项，每个待办事项包含 id、text、completed 等字段。可以过滤获取所有、仅未完成或仅已完成的待办事项。注意：此工具仅返回当前任务（taskId）的待办事项，不会返回其他任务的待办事项。',
    list_todos__parameters__properties__filter:
      '过滤类型：all-返回所有待办事项列表，active-仅返回未完成的待办事项列表，completed-仅返回已完成的待办事项列表',
    ask_user:
      '向用户提问并等待用户回答。会弹出全屏对话框展示问题与候选答案，用户也可以输入自定义答案。适用于关键歧义、缺失信息或需要用户偏好决策的场景。',
    ask_user__parameters__properties__question: '要向用户展示的问题（必填）',
    ask_user__parameters__properties__suggested_answers: '可选的候选答案列表（用户可一键选择）',
    ask_user__parameters__properties__allow_free_text: '是否允许用户输入自定义答案（默认 true）',
    ask_user__parameters__properties__placeholder: '自定义输入框的占位符（可选）',
    ask_user__parameters__properties__submit_label: '提交按钮文本（可选）',
    ask_user__parameters__properties__cancel_label: '取消按钮文本（可选）',
    ask_user__parameters__properties__max_length: '自定义输入最大长度（可选）',
    ask_user_batch:
      '向用户一次性提出多个问题并等待回答（Stepper 一题一屏）。适用于需要用户一次确认多个偏好/关键歧义的场景；用户中途取消会返回已答部分（partial answers）。',
    ask_user_batch__parameters__properties__questions: '问题列表（必填，至少 1 题）',
    ask_user_batch__parameters__properties__questions__items__properties__question:
      '要向用户展示的问题（必填）',
    ask_user_batch__parameters__properties__questions__items__properties__suggested_answers:
      '可选的候选答案列表（用户可一键选择）',
    ask_user_batch__parameters__properties__questions__items__properties__allow_free_text:
      '是否允许用户输入自定义答案（默认 true）',
    ask_user_batch__parameters__properties__questions__items__properties__placeholder:
      '自定义输入框的占位符（可选）',
    ask_user_batch__parameters__properties__questions__items__properties__submit_label:
      '提交按钮文本（可选）',
    ask_user_batch__parameters__properties__questions__items__properties__cancel_label:
      '取消按钮文本（可选）',
    ask_user_batch__parameters__properties__questions__items__properties__max_length:
      '自定义输入最大长度（可选）',
    update_task_status:
      '更新当前 AI 任务的状态。翻译任务：planning(规划中) → working(执行中) → review(复核中) → end(完成)；润色/校对任务：planning → working → end。注意：翻译任务支持 review → working 返回修改。',
    update_task_status__parameters__properties__status:
      '新的任务状态。planning: 正在规划并维护术语/角色/记忆；working: 正在执行翻译/润色/校对；review: 正在复核（仅翻译任务可用）；end: 任务完成',
    update_task_status__parameters__properties__reason: '状态变更的原因（可选）',
    add_translation_batch:
      '提交翻译/润色/校对结果，使用 paragraph_id。翻译可在 working/review，润色/校对仅在 working 调用。常规最多{max}段，允许10%容差至{tolerance}段；当前 chunk 未提交段落至多{doubleMax}段时，可一次提交至多{doubleMax}段。',
    add_translation_batch__parameters__properties__paragraphs:
      '结果数组，常规最多{max}段，允许10%容差至{tolerance}段；当前 chunk 未提交段落至多{doubleMax}段时，可提交至多{doubleMax}段。必须用 paragraph_id，禁止 index。',
    add_translation_batch__parameters__properties__paragraphs__items__properties__paragraph_id:
      '段落 ID（唯一提交标识，从 chunk 中 [ID: xxx] 获取）',
    add_translation_batch__parameters__properties__paragraphs__items__properties__translated_text:
      '翻译/润色/校对后的文本',
    search_help_docs:
      '根据关键词搜索应用的帮助文档。在标题和描述中进行模糊匹配。当用户询问应用的使用方法、功能介绍、操作指南等问题时，使用此工具搜索相关帮助文档。',
    search_help_docs__parameters__properties__query: '搜索关键词，可以是功能名称、操作描述等',
    get_help_doc:
      '获取指定帮助文档的完整内容。需要传入文档 ID（可通过 search_help_docs 或 list_help_docs 获取）。返回文档的标题、分类和 Markdown 格式的完整内容。',
    get_help_doc__parameters__properties__doc_id:
      '帮助文档的唯一 ID（例如 "front-page"、"ai-models-guide"）',
    navigate_to_help_doc:
      '导航到指定的帮助文档页面。将用户界面跳转到帮助中心并打开指定的文档，可选定位到文档内的具体章节。当用户询问使用方法后需要查看完整文档，或需要引导用户前往相关帮助页面时使用此工具。',
    navigate_to_help_doc__parameters__properties__doc_id:
      '帮助文档的唯一 ID（例如 "front-page"、"ai-models-guide"），可通过 search_help_docs 或 list_help_docs 获取',
    navigate_to_help_doc__parameters__properties__section_id:
      '可选的文档章节锚点 ID，从文档资源获取；界面语言切换后仍保留此标识。',
    list_help_docs:
      '列出所有可用的帮助文档，按类别分组。当用户想了解有哪些帮助文档可用，或需要浏览帮助目录时使用此工具。',
    add_translation_batch__parameters__properties__paragraphs__items__properties__original_text_prefix__enabled:
      '原文前缀锚点，建议开头5–10字符，trim 后至少3、至多20字符，用于核对 paragraph_id 与原文。',
    add_translation_batch__parameters__properties__paragraphs__items__properties__original_text_prefix__disabled:
      '原文前缀（可选），当前已禁用校验。',
  },
};
