# 批量替换工具使用示例

`batch_replace_translations` 工具用于批量替换段落翻译，支持根据关键词在原文或翻译文本中查找并替换。

## 工具参数

- `keywords`: 关键词数组（可选），在翻译文本中搜索
- `original_keywords`: 原文关键词数组（可选），在原文中搜索
- `replacement_text`: 新的翻译文本（必需）
- `chapter_id`: 章节 ID（可选），限制搜索范围
- `replace_all_translations`: 是否替换所有翻译（默认 false）
- `max_replacements`: 最大替换数量（默认 100）

## 使用示例

### 示例 1: 根据翻译文本关键词替换

**场景**: 将翻译中所有的 "他" 替换为 "她"

```json
{
  "keywords": ["他"],
  "replacement_text": "她",
  "replace_all_translations": true
}
```

**说明**: 
- 在所有翻译文本中搜索包含 "他" 的段落
- 将匹配段落的翻译文本中的 "他" 替换为 "她"
- 只匹配完整的词，不会匹配 "他们"、"其他" 等

### 示例 2: 根据原文关键词替换

**场景**: 将包含日文 "彼女" 的段落翻译统一替换

```json
{
  "original_keywords": ["彼女"],
  "replacement_text": "她",
  "replace_all_translations": true
}
```

**说明**:
- 在原文中搜索包含 "彼女" 的段落
- 如果翻译文本中也包含 "彼女"（或相同的原文关键词），则只替换匹配的关键词部分
- 如果翻译文本中找不到匹配的关键词，则跳过该段落（不会替换整个翻译）

### 示例 3: 同时使用原文和翻译关键词（AND 逻辑）

**场景**: 只替换同时包含原文 "学校" 和翻译 "学校" 的段落

```json
{
  "original_keywords": ["学校"],
  "keywords": ["学校"],
  "replacement_text": "学园",
  "replace_all_translations": true
}
```

**说明**:
- 段落必须同时满足：原文包含 "学校" 且翻译包含 "学校"
- 只替换同时满足两个条件的段落

### 示例 4: 使用多个关键词（OR 逻辑）

**场景**: 替换包含多个同义词的段落

```json
{
  "keywords": ["魔法", "法术", "咒语"],
  "replacement_text": "魔法",
  "replace_all_translations": true
}
```

**说明**:
- 翻译文本中包含 "魔法"、"法术" 或 "咒语" 任一关键词的段落都会被匹配
- 使用 OR 逻辑，只要包含任一关键词即可

### 示例 5: 限制在特定章节内替换

**场景**: 只在第一章中替换特定术语

```json
{
  "chapter_id": "chapter-123",
  "keywords": ["魔王"],
  "replacement_text": "魔王大人",
  "replace_all_translations": true
}
```

**说明**:
- 只在指定的章节内搜索和替换
- 其他章节不受影响

### 示例 6: 限制最大替换数量

**场景**: 只替换前 10 个匹配的段落（用于测试）

```json
{
  "keywords": ["测试"],
  "replacement_text": "试验",
  "max_replacements": 10
}
```

**说明**:
- 最多替换 10 个匹配的段落
- 用于小范围测试，避免意外替换过多内容

### 示例 7: 修正翻译错误

**场景**: 修正人名翻译错误

```json
{
  "keywords": ["约翰"],
  "replacement_text": "约翰·史密斯",
  "replace_all_translations": true
}
```

**说明**:
- 将所有 "约翰" 替换为完整的 "约翰·史密斯"
- 只匹配完整的词，不会匹配 "约翰逊" 等

### 示例 8: 统一术语翻译

**场景**: 统一将 "魔法师" 替换为 "法师"

```json
{
  "keywords": ["魔法师"],
  "replacement_text": "法师",
  "replace_all_translations": true
}
```

### 示例 9: 根据日文原文替换中文翻译

**场景**: 将包含日文 "お姉さん" 的段落翻译统一为 "姐姐"

```json
{
  "original_keywords": ["お姉さん"],
  "replacement_text": "姐姐",
  "replace_all_translations": true
}
```

**说明**:
- 在原文中搜索包含 "お姉さん" 的段落
- **注意**: 如果只提供原文关键词，工具会在翻译文本中查找相同的关键词进行替换
- 如果翻译文本中也包含该关键词（如数字、专有名词等可能相同的情况），则只替换匹配的关键词部分
- 如果翻译文本中找不到匹配的关键词，则跳过该段落（不会替换整个翻译）
- 如果同时提供原文和翻译关键词，则只替换翻译中匹配的关键词部分

### 示例 10: 复杂场景 - 多条件替换

**场景**: 替换同时包含日文 "学校" 和中文 "学校" 的段落，但只替换前 50 个

```json
{
  "original_keywords": ["学校"],
  "keywords": ["学校"],
  "replacement_text": "学园",
  "max_replacements": 50,
  "replace_all_translations": true
}
```

## 重要特性

### 1. 只替换关键词部分，不替换整个翻译
工具会智能地只替换匹配的关键词部分，保留翻译文本的其他内容：
- ✅ 原文: "お姉さんabc" → 翻译: "大姐abc" → 替换后: "姐姐abc"（只替换"大姐"为"姐姐"）
- ✅ 原文: "这是测试翻译" → 关键词: "测试" → 替换文本: "新翻译" → 替换后: "这是新翻译翻译"
- ✅ 原文: "This is a test." → 关键词: "test" → 替换文本: "New translation" → 替换后: "This is a New translation."

**重要**: 工具永远不会替换整个段落。如果只提供原文关键词（没有翻译关键词），工具会在翻译文本中查找相同的关键词进行替换；如果找不到匹配的关键词，则跳过该段落。

### 2. 完整词匹配
工具使用 `containsWholeKeyword` 函数确保只匹配完整的词：
- ✅ 匹配: "他" 在 "他走了" 中
- ❌ 不匹配: "他" 在 "他们走了" 中
- ✅ 匹配: "学校" 在 "去学校" 中
- ❌ 不匹配: "学校" 在 "学校长" 中

### 2. 多语言支持
- 支持英文单词边界匹配
- 支持中文、日文、韩文（CJK）字符匹配
- 支持混合语言文本

### 3. 搜索逻辑
- `keywords` 数组内使用 OR 逻辑（任一关键词匹配即可）
- `original_keywords` 数组内使用 OR 逻辑
- `keywords` 和 `original_keywords` 之间使用 AND 逻辑（必须同时满足）

### 4. 替换行为
- `replace_all_translations: false` (默认): 只替换第一个匹配的翻译
- `replace_all_translations: true`: 替换段落中所有匹配的翻译

## 注意事项

1. **关键词必须是完整词**: 工具会自动过滤部分匹配，确保只替换完整的词
2. **大小写不敏感**: 搜索不区分大小写
3. **性能考虑**: 使用 `max_replacements` 限制替换数量，避免意外替换过多内容
4. **章节限制**: 使用 `chapter_id` 可以限制搜索范围，提高效率
5. **测试建议**: 先使用较小的 `max_replacements` 值测试，确认无误后再进行全量替换

