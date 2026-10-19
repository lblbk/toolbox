import type { ToolDefinition } from './types'
import { qrTool } from './QrTool'
import { jsonTool } from './JsonTool'
import { base64Tool } from './Base64Tool'
import { timestampTool } from './TimestampTool'
import { bilibiliTool } from './BilibiliTool'

export const tools: ToolDefinition[] = [
  qrTool,
  bilibiliTool,
  jsonTool,
  base64Tool,
  timestampTool,
]

export type { ToolDefinition }

