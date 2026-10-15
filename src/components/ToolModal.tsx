import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { ToolDefinition } from '../tools/types'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function ToolModal({ tool, onClose }: { tool: ToolDefinition; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const Icon = tool.icon
  const ToolComponent = tool.component

  useEffect(() => {
    const restoreTo = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const nodes = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      ).filter((node) => node.offsetParent !== null)

      if (nodes.length === 0) {
        event.preventDefault()
        return
      }

      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const current = document.activeElement

      if (event.shiftKey && (current === first || current === panel.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      if (restoreTo instanceof HTMLElement) restoreTo.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="animate-overlay-in absolute inset-0 bg-zinc-950/45 backdrop-blur-sm"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`tool-${tool.id}-title`}
        className={`animate-panel-in relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-200/70 bg-white shadow-[0_30px_70px_-25px_rgba(24,24,27,0.45)] outline-none sm:max-h-[90dvh] sm:rounded-2xl ${
          tool.wide ? 'sm:max-w-5xl' : 'sm:max-w-2xl'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-x-0 top-0 h-1 bg-linear-to-r ${tool.theme.strip}`}
        />
        <header className="flex items-start gap-3 border-b border-zinc-100 bg-linear-to-b from-zinc-50/90 to-white px-4 py-3.5 sm:px-6 sm:py-4">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tool.theme.accent}`}
          >
            <Icon className="size-5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id={`tool-${tool.id}-title`}
              className="truncate text-base font-semibold tracking-tight text-zinc-900"
            >
              {tool.name}
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">{tool.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
            className="-mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-zinc-200/80 bg-white text-zinc-400 shadow-sm transition outline-none hover:border-zinc-300 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-violet-500/40"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          <ToolComponent />
        </div>
      </div>
    </div>
  )
}
