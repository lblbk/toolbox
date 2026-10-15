import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ToolDefinition } from '../tools/types'

function readHash() {
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * 让工具弹框和 URL hash 保持同步，这样单个工具可以直接分享链接。
 */
export function useActiveTool(tools: ToolDefinition[]) {
  const [id, setId] = useState<string | null>(readHash)

  useEffect(() => {
    const sync = () => setId(readHash())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const activeTool = useMemo(() => tools.find((tool) => tool.id === id) ?? null, [tools, id])

  const open = useCallback((toolId: string) => {
    window.history.pushState(null, '', `#${toolId}`)
    setId(toolId)
  }, [])

  const close = useCallback(() => {
    if (readHash()) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setId(null)
  }, [])

  return { activeTool, open, close }
}

