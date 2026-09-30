export default {
  aiImportTools: {
    preview_text_structure:
      '预览 TXT／Markdown 的正文范围与批量拆卷拆章，保存方案但不修改草稿。每批最多 500 章（含待归类内容）。regex 用独立整行标题模式，命名 title 组作标题；markdown 指定 chapter_level 和可选更浅的 volume_level，忽略代码内伪标题；single 将范围作一章。返回计数与五个示例，完整方案用 get_text_structure 分页查看。',
    preview_text_structure__parameters__properties__resource_id:
      '已保存 TXT／Markdown 的 extraction contentId，不接受快照 ID。坐标相对其拼接文本。',
    preview_text_structure__parameters__properties__volume_id:
      '未匹配卷标题的内容放入此已有卷；省略时创建未分卷。',
    preview_text_structure__parameters__properties__replace_chapter_ids:
      '明确替换该文件的已有草稿章；其他章保持不变。重叠时必须提供。',
    preview_text_structure__parameters__properties__rules__properties__chapter_pattern__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    preview_text_structure__parameters__properties__rules__properties__chapter_pattern__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    preview_text_structure__parameters__properties__rules__properties__volume_pattern__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    preview_text_structure__parameters__properties__rules__properties__volume_pattern__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    preview_text_structure__parameters__properties__rules__properties__include_headings:
      '是否在正文保留章标题，默认 false；卷标题始终提取到卷名。',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__start__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__start__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__end__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__end__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__body__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    preview_text_structure__parameters__properties__rules__properties__selection__properties__body__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    preview_text_structure__parameters__properties__rules__properties__selection:
      '可省略表示全部。start/end 各须唯一命中，保留两标记之间的正文（不含标记）；body 与起止标记互斥，须唯一命中并有命名 body 捕获组。',
    get_text_structure:
      '分页读取已保存的文本结构方案，查看卷章标题、字数、原文区间、首尾片段、警告或排除原因；不重新扫描。',
    apply_text_structure:
      '应用已预览的文本结构方案到草稿。原子创建或明确替换卷章；保留原文引用，不写书库。来源或草稿变化后须重新预览；同一方案重复应用不重做。',
    preview_draft_batch:
      '预览批量正文清理或卷章标题替换，保存版本绑定的方案；不修改草稿。最多 500 项，返回命中数和最多五个示例。正文按每个内容引用处理，可跨其内部多行，不跨不同引用；仅删除匹配片段或整行。标题支持 $1、$<name> 等捕获组替换。空 scope 表示全部；各筛选条件取交集。',
    preview_draft_batch__parameters__properties__scope__properties__title__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    preview_draft_batch__parameters__properties__scope__properties__title__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    preview_draft_batch__parameters__properties__pattern__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    preview_draft_batch__parameters__properties__pattern__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    preview_draft_batch__parameters__properties__replacement:
      '仅标题 replace 可用；正文禁止替换或新增文本。',
    apply_draft_batch:
      '应用已预览的草稿批量方案，整批原子提交；草稿变化后必须重新预览。重复执行同一批次不重做；不写书库。',
    run_chapter_batch:
      '按准备好的计划提取全部待处理章节并逐章保存到草稿，最多 3 路并发；返回计数和少量异常，不返回正文。中断后续跑；retry_failed 只重试失败项。',
    get_chapter_batch: '分页查看章节批次的状态、错误和正文引用；正文用 read_source 按需抽查。',
    prepare_chapter_batch:
      '抽样确认后准备章节批次：固定来源、顺序和规则，创建待提取草稿；不抓正文。source_ids、discovery_ids、catalog 三选一，每批最多 500 章。',
    prepare_chapter_batch__parameters__properties__filter__properties__name__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    prepare_chapter_batch__parameters__properties__filter__properties__name__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    prepare_chapter_batch__parameters__properties__filter__properties__locator__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    prepare_chapter_batch__parameters__properties__filter__properties__locator__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    prepare_chapter_batch__parameters__properties__filter:
      '在显式传入的来源/发现或目录窗口内筛选；name 匹配名称，locator 匹配 URL/文件路径，多条件取交集，不扩大来源范围。',
    list_sources: '列出当前任务来源及状态；不读取正文。',
    inspect_source: '显式检查一个来源的结构、元信息和资源引用；不自动追加或跟随链接。',
    read_source:
      '分页读取保存的快照或提取结果。blocks 返回稳定块 ID 与预览；text 可继续读取完整文本，excluded 检查排除记录，inspection 检查元信息。',
    add_sources: '只追加已观察到的发现引用；保留父来源及用途，不抓取内容。',
    add_sources__parameters__properties__filter__properties__name__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    add_sources__parameters__properties__filter__properties__name__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    add_sources__parameters__properties__filter__properties__locator__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    add_sources__parameters__properties__filter__properties__locator__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    add_sources__parameters__properties__filter:
      '在显式传入的来源/发现或目录窗口内筛选；name 匹配名称，locator 匹配 URL/文件路径，多条件取交集，不扩大来源范围。',
    extract_novel_info: '检查小说元信息、目录资源和后续发现引用；不会获取目录外章节正文。',
    extract_content:
      '按明确来源及规则提取原文，保存完整结果并返回内容引用；每批最多八项，不改写正文。',
    extract_content__parameters__properties__filter__properties__name__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    extract_content__parameters__properties__filter__properties__name__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    extract_content__parameters__properties__filter__properties__locator__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    extract_content__parameters__properties__filter__properties__locator__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    extract_content__parameters__properties__filter:
      '在显式传入的来源/发现或目录窗口内筛选；name 匹配名称，locator 匹配 URL/文件路径，多条件取交集，不扩大来源范围。',
    get_import_draft:
      '读取当前草稿版本、目标与必要问题。chapters 分页列出章节概要；chapter 按 chapter_id 分页读取该章内容引用。',
    edit_import_draft:
      '按版本原子编辑草稿。先声明小说候选及来源归属，再建卷章；sourceIds 可传空数组由宿主从引用计算。只能引用原文；不能伪造确认或写入书库。',
    edit_import_draft__parameters__properties__operations__items__properties__candidates__items__properties__content__items__properties__excludeRanges:
      '相对该引用原始解析文本的 UTF-16 排除范围，升序、非重叠。优先使用批量工具计算。',
    edit_import_draft__parameters__properties__operations__items__properties__candidates__items__properties__content__items:
      'extraction 引用已保存提取结果（可选块范围、块内 start/end）；existing 必须给出当前目标的 bookId、bookRevision、chapterId、paragraphId。',
    edit_import_draft__parameters__properties__operations__items__properties__chapter__properties__content__items__properties__excludeRanges:
      '相对该引用原始解析文本的 UTF-16 排除范围，升序、非重叠。优先使用批量工具计算。',
    edit_import_draft__parameters__properties__operations__items__properties__chapter__properties__content__items:
      'extraction 引用已保存提取结果（可选块范围、块内 start/end）；existing 必须给出当前目标的 bookId、bookRevision、chapterId、paragraphId。',
    search_books: '按书名、作者或来源线索搜索本地小说，只返回候选及依据。',
    get_book_info: '读取明确小说 ID 的基本信息，不附带模型配置、凭据或记忆。',
    list_chapters: '按明确小说 ID 分页读取卷章结构。',
    get_chapter_info: '按明确小说和章节 ID 分页读取原文及对应引用所需修改序号。',
    search_web: '仅搜索作者、简介、封面、别名等元信息；结果保持 metadata-only，不能作为替代正文。',
    rename_import_task:
      '为当前导入任务命名，便于用户在任务列表中区分。识别出书名等书本信息后必须调用；通常用书名，可附作者或范围。用户手动命名后不能修改。',
    record_update_recipe:
      '网页来源的章节与目录一一对应并整理完成后，声明这本书的更新配方。宿主只用已保存的快照离线回放：要求草稿中该站点的已选章节与目录链接一一对应，并逐段复现草稿正文（固定正文章节除外，最多 20%）。不通过则拒绝并返回差异示例；通过后作为一次草稿修改写入。内置站点自动采用内置引擎（忽略 catalog_selector 和 chapter_filter），正文规则缺省时沿用导入时实际使用的提取规则。',
    record_update_recipe__parameters__properties__catalog_selector:
      '目录链接不在标准目录容器（nav、.toc 等）中时，指定链接所在范围的 CSS 选择器。',
    record_update_recipe__parameters__properties__chapter_filter__properties__name__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    record_update_recipe__parameters__properties__chapter_filter__properties__name__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    record_update_recipe__parameters__properties__chapter_filter__properties__locator__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    record_update_recipe__parameters__properties__chapter_filter__properties__locator__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    record_update_recipe__parameters__properties__chapter_filter:
      '在显式传入的来源/发现或目录窗口内筛选；name 匹配名称，locator 匹配 URL/文件路径，多条件取交集，不扩大来源范围。',
    record_update_recipe__parameters__properties__content_rules:
      '正文提取规则；缺省时从草稿章节导入时使用的规则推导。',
    record_update_recipe__parameters__properties__cleanup__items__properties__pattern__properties__pattern:
      '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    record_update_recipe__parameters__properties__cleanup__items__properties__pattern__properties__flags:
      '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    record_update_recipe__parameters__properties__cleanup:
      '回放时依次执行的清理规则；草稿中用过的批量清理要一并声明。',
    record_update_recipe__parameters__properties__strip_heading:
      '正文首个非空行与目录标题完全相同时删除该行。',
    record_update_recipe__parameters__properties__pinned_chapter_ids:
      '有意手工修改过、回放无法复现的草稿章节；最多占对应章节数的 20%。',
    preview_import: '根据当前草稿版本生成真实差异与译文影响，保存待用户检查的方案；不会应用。',
    ask_user:
      '向用户提出一个必要问题。导入执行会保存问题并暂停，用户在导入工作台回答后恢复，并返回回答。只用于无法从来源判断的关键歧义。',
    ask_user__parameters__properties__question: '要向用户展示的问题（必填）',
    ask_user__parameters__properties__suggested_answers: '可选的候选答案列表（用户可一键选择）',
    ask_user__parameters__properties__allow_free_text: '是否允许用户输入自定义答案（默认 true）',
    ask_user__parameters__properties__placeholder: '自定义输入框的占位符（可选）',
    ask_user__parameters__properties__submit_label: '提交按钮文本（可选）',
    ask_user__parameters__properties__cancel_label: '取消按钮文本（可选）',
    ask_user__parameters__properties__max_length: '自定义输入最大长度（可选）',
    ask_user_batch:
      '一次向用户提出多个必要问题。导入执行会保存问题并暂停，用户须回答全部问题后才会恢复。',
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
  },
};
