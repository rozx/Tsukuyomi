# 主题使用指南

本文档说明如何在应用中使用统一的主题样式。

## 颜色系统

### 主色 (Primary - Luna)
- `primary` / `luna-500`: `#f0458b` - 主要操作色
- `primary/10`: `rgba(240, 69, 139, 0.1)` - 浅色背景
- `primary/20`: `rgba(240, 69, 139, 0.2)` - 中等背景
- `primary/50`: `rgba(240, 69, 139, 0.5)` - 边框/强调

### 背景色 (Night)
- `night-900`: `#0b1026` - 主背景
- `night-950`: `#070a1a` - 深色背景
- `bg-night-900/50`: 半透明背景

### 文本色 (Moon)
- `text-moon/90`: `rgba(246, 243, 209, 0.9)` - 主要文本
- `text-moon/70`: `rgba(246, 243, 209, 0.7)` - 次要文本
- `text-moon/60`: `rgba(246, 243, 209, 0.6)` - 辅助文本
- `text-moon/40`: `rgba(246, 243, 209, 0.4)` - 禁用文本

## 统一的工具类

### 卡片样式
```html
<!-- 基础卡片 -->
<div class="card-base p-4">
  <!-- 内容 -->
</div>

<!-- 带标题的卡片 -->
<div class="card-base">
  <div class="card-header">
    <h3>标题</h3>
  </div>
  <div class="card-content">
    <!-- 内容 -->
  </div>
  <div class="card-footer">
    <!-- 操作按钮 -->
  </div>
</div>
```

### 列表项样式
```html
<!-- 基础列表项 -->
<div class="list-item-base hover:list-item-hover">
  <!-- 内容 -->
</div>

<!-- 选中状态 -->
<div class="list-item-base list-item-selected">
  <!-- 内容 -->
</div>
```

### 输入组样式
```html
<div class="input-group-base p-3">
  <!-- 输入内容 -->
</div>
```

## 常用样式模式

### 背景和边框
- `bg-white/5` - 浅色背景 (5% 透明度)
- `bg-white/10` - 中等背景 (10% 透明度)
- `border-white/10` - 浅色边框 (10% 透明度)
- `border-white/20` - 中等边框 (20% 透明度)

### 文本颜色
- `text-moon/90` - 主要文本
- `text-moon/70` - 次要文本
- `text-moon/60` - 辅助文本
- `text-primary` - 主色文本

### 圆角
- `rounded-lg` - 8px (标准)
- `rounded-xl` - 12px (大圆角)

### 间距
- `p-3` / `p-4` - 内边距
- `gap-2` / `gap-3` - 间距

## 最佳实践

1. **优先使用工具类**: 使用 `card-base`, `list-item-base` 等工具类而不是自定义样式
2. **保持一致性**: 相同类型的元素使用相同的样式
3. **使用主题颜色**: 使用 `primary`, `moon`, `night` 颜色而不是硬编码颜色值
4. **透明度级别**: 使用标准的透明度级别 (5%, 10%, 20%, 50% 等)

## 示例

### 对话框内容区域
```html
<div class="card-base p-4">
  <h3 class="text-lg font-semibold text-moon/90 mb-3">标题</h3>
  <p class="text-sm text-moon/70">内容</p>
</div>
```

### 列表项
```html
<div class="list-item-base hover:list-item-hover cursor-pointer">
  <div class="font-medium text-sm text-moon/90">标题</div>
  <div class="text-xs text-moon/60">描述</div>
</div>
```

### 标签
```html
<span class="px-2 py-1 text-xs bg-primary/20 text-primary rounded border border-primary/30">
  标签
</span>
```

