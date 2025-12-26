/**
 * 翻译文本规范化工具
 * 用于确保翻译文本中的符号格式一致
 */

/**
 * 规范化翻译文本中的引号
 * 将所有半角引号转换为全角日语引号：
 * - 半角双引号 "" → 日语引号 「」
 * - 半角单引号 '' → 日语单引号 『』
 * - 反之亦然（日语引号 → 全角普通引号）
 *
 * 重要：已存在的「」引号永远不会被转换为『』，以保持原文的引号风格
 * @param text 要规范化的文本
 * @returns 规范化后的文本
 */
export function normalizeTranslationQuotes(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let normalized = text;

  // 重要：保护已存在的「」引号，确保它们永远不会被转换为『』
  // 我们只转换半角引号和其他类型的引号，不改变已存在的「」引号

  // 先处理成对的引号
  // 将成对的半角普通引号 "" 替换为日语引号 「」（全角）
  // 注意：需要从外到内处理嵌套引号
  // 例如：""aaa"" 应该转换为 「「aaa」」，而不是 「」aaa「」
  // 使用递归方式从外到内处理嵌套引号
  // 对于相同字符的引号（如 "），需要从外到内处理；对于不同字符的引号，使用栈匹配
  function replaceNestedQuotes(str: string, openChar: string, closeChar: string, replacementOpen: string, replacementClose: string): string {
    const isSameChar = openChar === closeChar; // 开引号和闭引号是否相同（如 "）
    
    if (isSameChar) {
      // 当开引号和闭引号相同时，需要从外到内处理嵌套引号
      // 先统计引号数量
      const quoteCount = (str.match(new RegExp(openChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      
      // 如果没有引号或只有奇数个引号，使用更智能的方法处理成对的引号
      if (quoteCount === 0 || quoteCount % 2 !== 0) {
        // 对于奇数个引号，我们需要找到真正的成对引号
        // 策略：找到所有引号的位置，然后从内到外匹配成对的引号
        const quoteIndices: number[] = [];
        const chars = str.split('');
        
        // 收集所有引号的位置
        for (let i = 0; i < chars.length; i++) {
          if (chars[i] === openChar) {
            quoteIndices.push(i);
          }
        }
        
        if (quoteIndices.length === 0) {
          return str;
        }
        
        // 从内到外匹配成对的引号
        // 策略：找到所有相邻的引号对（两个引号之间没有其他引号），然后递归处理
        const pairs: Array<[number, number]> = [];
        const usedIndices = new Set<number>();
        
        // 从内到外匹配：找到所有相邻的引号对（两个引号之间没有其他引号）
        // 使用贪心算法：总是匹配距离最近的两个引号
        let changed = true;
        while (changed) {
          changed = false;
          let minDistance = Infinity;
          let bestPair: [number, number] | null = null;
          
          // 找到所有未使用的引号对，选择距离最近的一对
          for (let i = 0; i < quoteIndices.length - 1; i++) {
            if (usedIndices.has(quoteIndices[i]!)) continue;
            
            const openIndex = quoteIndices[i]!;
            // 找到下一个未使用的引号
            for (let j = i + 1; j < quoteIndices.length; j++) {
              if (usedIndices.has(quoteIndices[j]!)) continue;
              
              const closeIndex = quoteIndices[j]!;
              // 检查这两个引号之间是否有其他未使用的引号
              const hasOtherQuotes = quoteIndices.some(
                (idx) => idx > openIndex && idx < closeIndex && !usedIndices.has(idx)
              );
              
              if (!hasOtherQuotes) {
                // 找到了成对的引号（两个引号之间没有其他引号）
                const distance = closeIndex - openIndex;
                if (distance < minDistance) {
                  minDistance = distance;
                  bestPair = [openIndex, closeIndex];
                }
              }
            }
          }
          
          // 如果找到了最佳配对，添加到列表中
          if (bestPair) {
            pairs.push(bestPair);
            usedIndices.add(bestPair[0]);
            usedIndices.add(bestPair[1]);
            changed = true;
          }
        }
        
        // 如果没有找到成对的引号，保持原样
        if (pairs.length === 0) {
          return str;
        }
        
        // 按开引号位置排序，从后往前处理，避免索引偏移问题
        pairs.sort((a, b) => b[0] - a[0]);
        
        // 构建结果：从后往前处理，使用字符串拼接避免索引偏移
        let result = str;
        for (const [openIndex, closeIndex] of pairs) {
          // 递归处理内部内容
          const innerContent = str.slice(openIndex + 1, closeIndex);
          const processedInner = replaceNestedQuotes(innerContent, openChar, closeChar, replacementOpen, replacementClose);
          
          // 构建新字符串：前缀 + 开引号 + 处理后的内部内容 + 闭引号 + 后缀
          const prefix = result.slice(0, openIndex);
          const suffix = result.slice(closeIndex + 1);
          result = prefix + replacementOpen + processedInner + replacementClose + suffix;
        }
        
        // 检查结果中是否还有需要处理的引号
        const remainingQuoteCount = (result.match(new RegExp(openChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        
        // 如果还有原始引号需要处理且数量是偶数，继续递归处理
        if (remainingQuoteCount > 0 && remainingQuoteCount % 2 === 0) {
          return replaceNestedQuotes(result, openChar, closeChar, replacementOpen, replacementClose);
        }
        return result;
      }
      
      // 如果有偶数个引号，从外到内处理
      // 使用递归：找到最外层的引号对，递归处理内部，然后处理剩余部分
      const firstIndex = str.indexOf(openChar);
      if (firstIndex === -1) {
        return str; // 没有引号，保持原样
      }
      
      // 从后往前找到最后一个引号（与第一个配对，形成最外层）
      const lastIndex = str.lastIndexOf(closeChar);
      if (lastIndex === -1 || lastIndex <= firstIndex) {
        return str; // 没有成对的引号，保持原样
      }
      
      // 递归处理内部内容
      const innerContent = str.slice(firstIndex + 1, lastIndex);
      const processedInner = replaceNestedQuotes(innerContent, openChar, closeChar, replacementOpen, replacementClose);
      
      // 构建结果：前缀 + 开引号 + 处理后的内部内容 + 闭引号 + 后缀
      const prefix = str.slice(0, firstIndex);
      const suffix = str.slice(lastIndex + 1);
      const newStr = prefix + replacementOpen + processedInner + replacementClose + suffix;
      
      // 继续处理剩余部分（可能还有更多引号对）
      return replaceNestedQuotes(newStr, openChar, closeChar, replacementOpen, replacementClose);
    } else {
      // 开引号和闭引号不同，使用栈来匹配
      const chars = str.split('');
      const result: string[] = [];
      const stack: number[] = [];
      
      for (let i = 0; i < chars.length; i++) {
        const char = chars[i]!;
        if (char === openChar) {
          stack.push(result.length);
          result.push(replacementOpen);
        } else if (char === closeChar && stack.length > 0) {
          stack.pop();
          result.push(replacementClose);
        } else {
          result.push(char);
        }
      }
      
      // 如果栈不为空，说明有未配对的引号，需要恢复为原始字符
      while (stack.length > 0) {
        const pos = stack.pop()!;
        if (result[pos] === replacementOpen) {
          result[pos] = openChar;
        }
      }
      
      return result.join('');
    }
  }
  
  // 处理半角双引号
  normalized = replaceNestedQuotes(normalized, '"', '"', '「', '」');
  
  // 处理全角双引号
  // 全角左双引号是 U+201C ("), 全角右双引号是 U+201D (")
  normalized = replaceNestedQuotes(normalized, '\u201C', '\u201D', '「', '」');

  // 处理成对的单引号
  // 先处理全角单引号对 ''（U+2018...U+2019），必须在其他单引号模式之前
  normalized = replaceNestedQuotes(normalized, '\u2018', '\u2019', '『', '』');
  // 将成对的 ASCII 单引号 '' 替换为日语单引号 『』
  normalized = replaceNestedQuotes(normalized, "'", "'", '『', '』');

  // 重要说明：单个或奇数个引号不会被转换，保持原样
  // 这是因为正则表达式要求匹配完整的引号对（开引号+内容+闭引号）
  // 如果文本中只有单个引号或奇数个引号，正则表达式无法匹配，因此会保持原样
  // 这是有意的设计，因为未配对的引号通常表示特殊情况（如缩写、所有格等），不应该被自动转换

  // 将所有半角标点符号转换为全角
  // 逗号：, → ，
  normalized = normalized.replace(/,/g, '，');
  // 句号：. → 。
  normalized = normalized.replace(/\./g, '。');
  // 问号：? → ？
  normalized = normalized.replace(/\?/g, '？');
  // 感叹号：! → ！
  normalized = normalized.replace(/!/g, '！');
  // 冒号：: → ：
  normalized = normalized.replace(/:/g, '：');
  // 分号：; → ；
  normalized = normalized.replace(/;/g, '；');
  // 左括号：( → （
  normalized = normalized.replace(/\(/g, '（');
  // 右括号：) → ）
  normalized = normalized.replace(/\)/g, '）');
  // 左方括号：[ → 【
  normalized = normalized.replace(/\[/g, '【');
  // 右方括号：] → 】
  normalized = normalized.replace(/\]/g, '】');
  // 左花括号：{ → ｛
  normalized = normalized.replace(/\{/g, '｛');
  // 右花括号：} → ｝
  normalized = normalized.replace(/\}/g, '｝');
  // 破折号：- → －
  normalized = normalized.replace(/-/g, '－');
  // 下划线：_ → ＿
  normalized = normalized.replace(/_/g, '＿');
  // 波浪号：~ → ～
  normalized = normalized.replace(/~/g, '～');
  // 省略号：... → …
  normalized = normalized.replace(/\.\.\./g, '…');
  // 百分号：% → ％
  normalized = normalized.replace(/%/g, '％');
  // 和号：& → ＆
  normalized = normalized.replace(/&/g, '＆');
  // 星号：* → ＊
  normalized = normalized.replace(/\*/g, '＊');
  // 井号：# → ＃
  normalized = normalized.replace(/#/g, '＃');
  // 加号：+ → ＋
  normalized = normalized.replace(/\+/g, '＋');
  // 等号：= → ＝
  normalized = normalized.replace(/=/g, '＝');
  // 小于号：< → ＜
  normalized = normalized.replace(/</g, '＜');
  // 大于号：> → ＞
  normalized = normalized.replace(/>/g, '＞');
  // 竖线：| → ｜
  normalized = normalized.replace(/\|/g, '｜');
  // 反斜杠：\ → ＼
  normalized = normalized.replace(/\\/g, '＼');
  // 斜杠：/ → ／
  normalized = normalized.replace(/\//g, '／');
  // @ 符号：@ → ＠
  normalized = normalized.replace(/@/g, '＠');
  // $ 符号：$ → ＄
  normalized = normalized.replace(/\$/g, '＄');

  return normalized;
}

/**
 * 检查引号是否已正确嵌套
 * @param text 要检查的文本
 * @returns 如果引号已正确嵌套，返回 true
 */
function areQuotesProperlyNested(text: string, openChar: string, closeChar: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === openChar) {
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth < 0) {
        return false; // 闭引号出现在开引号之前
      }
    }
  }
  return depth === 0; // 所有引号都已正确闭合
}

/**
 * 修复不匹配的引号对
 * 例如：将「…「修复为「…」，将」…」修复为「…」
 * 注意：不会修改已正确嵌套的引号（如「「噫——」」）
 * @param text 要修复的文本
 * @returns 修复后的文本
 */
function fixMismatchedQuotes(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let result = text;

  // 检查双引号「」是否已正确嵌套，如果是则跳过修复
  if (areQuotesProperlyNested(result, '「', '」')) {
    // 引号已正确嵌套，不需要修复
  } else {
    // 修复双引号「」的不匹配
    // 统计开引号和闭引号的数量
    const openDoubleQuotes = (result.match(/「/g) || []).length;
    const closeDoubleQuotes = (result.match(/」/g) || []).length;

    // 如果开引号多于闭引号，将多余的最后一个开引号改为闭引号
    if (openDoubleQuotes > closeDoubleQuotes) {
      const diff = openDoubleQuotes - closeDoubleQuotes;
      // 从后往前找到最后一个开引号，将其改为闭引号
      let count = 0;
      const chars = result.split('');
      // 从后往前遍历，找到需要修改的开引号
      for (let i = chars.length - 1; i >= 0 && count < diff / 2; i--) {
        if (chars[i] === '「') {
          chars[i] = '」';
          count++;
        }
      }
      result = chars.join('');
    }
    // 如果闭引号多于开引号，将多余的第一个闭引号改为开引号
    else if (closeDoubleQuotes > openDoubleQuotes) {
      const diff = closeDoubleQuotes - openDoubleQuotes;
      // 从前往后找到第一个闭引号，将其改为开引号
      let count = 0;
      result = result
        .split('')
        .map((char) => {
          if (char === '」' && count < diff / 2) {
            count++;
            return '「';
          }
          return char;
        })
        .join('');
    }
  }

  // 检查单引号『』是否已正确嵌套，如果是则跳过修复
  if (areQuotesProperlyNested(result, '『', '』')) {
    // 引号已正确嵌套，不需要修复
  } else {
    // 修复单引号『』的不匹配
    const openSingleQuotes = (result.match(/『/g) || []).length;
    const closeSingleQuotes = (result.match(/』/g) || []).length;

    // 如果开引号多于闭引号，将多余的最后一个开引号改为闭引号
    if (openSingleQuotes > closeSingleQuotes) {
      const diff = openSingleQuotes - closeSingleQuotes;
      let count = 0;
      const chars = result.split('');
      for (let i = chars.length - 1; i >= 0; i--) {
        if (chars[i] === '『' && count < diff / 2) {
          chars[i] = '』';
          count++;
        }
      }
      result = chars.join('');
    }
    // 如果闭引号多于开引号，将多余的第一个闭引号改为开引号
    else if (closeSingleQuotes > openSingleQuotes) {
      const diff = closeSingleQuotes - openSingleQuotes;
      let count = 0;
      result = result
        .split('')
        .map((char) => {
          if (char === '』' && count < diff / 2) {
            count++;
            return '『';
          }
          return char;
        })
        .join('');
    }
  }

  return result;
}

/**
 * 全面规范化翻译文本中的所有符号
 * 包括引号规范化、半角转全角、以及其他符号格式统一
 * @param text 要规范化的文本
 * @returns 规范化后的文本
 */
export function normalizeTranslationSymbols(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // 按行处理：
  // - 保护行首缩进（leading spaces）
  // - 行尾空格会被规范化（例如：标点后的多余空格会被移除）
  const lines = text.split('\n');
  const processedLines = lines.map((line) => {
    // 特殊处理：整行只包含空白字符
    // 规则与单测一致：2 个及以上空格合并为 1 个全角空格；单个空格保留
    if (line.trim().length === 0) {
      // 空行（由 split('\n') 产生）应保持为空，避免把换行符后无内容的行变成全角空格
      if (line.length === 0) {
        return '';
      }
      if (line === ' ') {
        return ' ';
      }
      // 包含多个空白字符（含多个空格 / tab 等）统一归一为一个全角空格
      return '\u3000';
    }

    // 保存行首空格（用于缩进）
    const leadingMatch = line.match(/^(\s*)/);
    const leadingSpaces = leadingMatch ? leadingMatch[1]! : '';

    // 移除行首空格后，再移除行尾空格进行规范化
    // 注意：行尾空格不应无条件“原样保留”，否则会把规范化移除的空格重新拼回去
    const contentWithoutSpaces = line.slice(leadingSpaces.length).replace(/\s+$/g, '');
    
    // 规范化内容（不包含行首和行尾空格）
    let normalized = contentWithoutSpaces;

    // 0. 先标记和保护 URL，避免被后续处理影响
    // URL 模式：http:// 或 https:// 后跟有效的 URL 字符
    const urlMarker = '\uE002'; // 使用私有使用区字符作为临时标记
    const urlPlaceholders: string[] = [];
    // 匹配 http:// 或 https:// 开头的 URL
    // URL 可以包含：字母、数字、点、斜杠、冒号、问号、等号、&、#、%、连字符、下划线、加号、波浪号等
    // URL 在遇到空格、中文标点、行尾或某些特殊字符时结束
    normalized = normalized.replace(/(https?:\/\/[^\s，。！？：；\u4e00-\u9fff]+)/gi, (match) => {
      const placeholder = `${urlMarker}${urlPlaceholders.length}${urlMarker}`;
      urlPlaceholders.push(match);
      return placeholder;
    });

    // 1. 先标记小数点，避免被后续处理影响
    // 使用临时标记保护小数点（数字.数字 的模式）
    const decimalMarker = '\uE001'; // 使用私有使用区字符作为临时标记
    normalized = normalized.replace(/(\d)\.(\d)/g, `$1${decimalMarker}$2`); // 标记小数点

    // 2. 先处理省略号（在 normalizeTranslationQuotes 之前，避免点号被转换）
    normalized = normalized.replace(/\.{3,}/g, '…'); // 3个或更多点号转为省略号

    // 3. 规范化引号（使用现有的引号规范化逻辑）
    normalized = normalizeTranslationQuotes(normalized);

    // 4. 处理 normalizeTranslationQuotes 转换后的省略号情况（全角句号）
    normalized = normalized.replace(/。{3,}/g, '…'); // 多个全角句号转为省略号

    // 5. 修复不匹配的引号对（在 normalizeTranslationQuotes 之后，确保引号格式正确）
    normalized = fixMismatchedQuotes(normalized);

    // 6. 恢复小数点标记
    normalized = normalized.replace(new RegExp(decimalMarker, 'g'), '.');

    // 7. 恢复 URL 标记
    urlPlaceholders.forEach((url, index) => {
      const placeholder = `${urlMarker}${index}${urlMarker}`;
      normalized = normalized.replace(placeholder, url);
    });

    // 8. 规范化空格：将多个连续空格合并为单个全角空格
    // 只处理多个连续空格，保留单个空格（因为 normalizeTranslationQuotes 已经处理了标点）
    normalized = normalized.replace(/[\u0020\u00A0\u3000]{2,}/g, '\u3000'); // 多个连续空格合并为单个全角空格

    // 9. 规范化破折号：统一各种破折号格式
    // 先处理多个连续破折号的情况
    normalized = normalized.replace(/—{3,}/g, '——'); // 3个或更多破折号转为双破折号
    normalized = normalized.replace(/–{3,}/g, '——'); // 3个或更多短破折号转为双破折号
    // 将单个英文破折号（—、–）转换为中文破折号（——）
    // 使用临时标记避免重复处理
    const tempMarker = '\uE000'; // 使用私有使用区字符作为临时标记
    normalized = normalized.replace(/——/g, tempMarker); // 临时标记双破折号
    normalized = normalized.replace(/—/g, '——'); // 单个 — 转为 ——
    normalized = normalized.replace(/–/g, '——'); // 单个 – 转为 ——
    normalized = normalized.replace(new RegExp(tempMarker, 'g'), '——'); // 恢复双破折号
    // 注意：单个 - 已经在 normalizeTranslationQuotes 中处理为全角 －

    // 10. 规范化书名号：确保使用正确的书名号
    // 处理已经是全角 < > 的情况（normalizeTranslationQuotes 会转换）
    normalized = normalized.replace(/([^＜\s])＜([^＜＞]{1,50})＞([^＞\s])/g, '$1《$2》$3');
    normalized = normalized.replace(/^＜([^＜＞]{1,50})＞([^＞\s])/g, '《$1》$2'); // 行首
    normalized = normalized.replace(/([^＜\s])＜([^＜＞]{1,50})＞$/g, '$1《$2》'); // 行尾
    // 处理半角 < > 的情况（如果 normalizeTranslationQuotes 没有处理）
    normalized = normalized.replace(/([^<\s])<([^<>]{1,50})>([^>\s])/g, '$1《$2》$3');
    normalized = normalized.replace(/^<([^<>]{1,50})>([^>\s])/g, '《$1》$2'); // 行首
    normalized = normalized.replace(/([^<\s])<([^<>]{1,50})>$/g, '$1《$2》'); // 行尾

    // 11. 规范化间隔号：保持中文间隔号（不转换，因为中文翻译中常用中文间隔号）
    // 如果需要日文间隔号，可以取消注释下面这行
    // normalized = normalized.replace(/·/g, '・');

    // 12. 规范化数字和标点的组合：确保数字后的句号是全角
    // 只在数字后直接跟句号且后面是空格、换行或结尾时转换（避免影响小数点）
    // 小数点后面应该跟数字，所以检查后面不是数字的情况
    normalized = normalized.replace(/(\d)\.(?![0-9])([\s\n\u3000]|$)/g, '$1。$2'); // 数字后的句号转为全角

    // 13. 规范化括号内的多余空格：移除括号紧邻的多余空格
    normalized = normalized.replace(/（\s+/g, '（');
    normalized = normalized.replace(/\s+）/g, '）');
    normalized = normalized.replace(/【\s+/g, '【');
    normalized = normalized.replace(/\s+】/g, '】');

    // 14. 规范化引号内的多余空格：移除引号紧邻的多余空格
    normalized = normalized.replace(/「\s+/g, '「');
    normalized = normalized.replace(/\s+」/g, '」');
    normalized = normalized.replace(/『\s+/g, '『');
    normalized = normalized.replace(/\s+』/g, '』');

    // 15. 规范化行尾标点：移除行尾多余空格（包括换行符前的空格）
    // 注意：只移除标点后的空格，不 trim 整个字符串
    normalized = normalized.replace(/([，。！？：；])[\u0020\u00A0\u3000]+$/gm, '$1'); // 行尾标点后的空格（不包括换行符）
    normalized = normalized.replace(/([，。！？：；])[\u0020\u00A0\u3000]+(\r?\n)/g, '$1$2'); // 行尾标点后的空格和换行

    // 恢复行首缩进（行尾空格不再无条件恢复）
    return leadingSpaces + normalized;
  });

  return processedLines.join('\n');
}
