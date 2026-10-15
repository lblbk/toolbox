import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

/** 每个工具一组配色，字段都是完整的 Tailwind 类名，便于静态扫描 */
export type ToolTheme = {
  /** 图标底色：饱和渐变 + 同色投影 */
  accent: string
  /** 卡片与弹框顶部色条 */
  strip: string
  /** 卡片悬停时的边框与投影染色 */
  wash: string
  /** 标签底色 */
  tag: string
}

export type ToolDefinition = {
  /** 同时作为 URL hash，保持小写短横线风格 */
  id: string
  name: string
  description: string
  keywords: string[]
  /** 卡片底部的短标签 */
  tags: string[]
  icon: LucideIcon
  theme: ToolTheme
  /** 核心工具用深色主卡片突出显示 */
  featured?: boolean
  /** 内容偏宽的工具使用更大的弹框 */
  wide?: boolean
  component: ComponentType
}

