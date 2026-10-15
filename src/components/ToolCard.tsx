import { ArrowUpRight } from 'lucide-react'
import type { ToolDefinition } from '../tools/types'

export function ToolCard({
  tool,
  index = 0,
  onOpen,
}: {
  tool: ToolDefinition
  index?: number
  onOpen: () => void
}) {
  const Icon = tool.icon
  const { theme } = tool

  const tags = (
    <span className="relative mt-4 flex flex-wrap gap-1.5">
      {tool.tags.map((tag) => (
        <span key={tag} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${theme.tag}`}>
          {tag}
        </span>
      ))}
    </span>
  )

  if (tool.featured) {
    return (
      <button
        type="button"
        onClick={onOpen}
        style={{ animationDelay: `${index * 45}ms` }}
        className={`animate-card-in group relative flex w-full flex-col overflow-hidden rounded-2xl bg-linear-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-5 text-left shadow-[0_18px_40px_-24px_rgba(24,24,27,0.7)] transition-all duration-300 outline-none hover:-translate-y-1.5 hover:shadow-[0_28px_55px_-24px_rgba(24,24,27,0.85)] focus-visible:ring-2 focus-visible:ring-violet-400/60 active:translate-y-0 active:scale-[0.99] ${theme.wash}`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_8%_0%,rgba(139,92,246,0.3),transparent_58%)]"
        />
        <span
          aria-hidden="true"
          className={`absolute inset-x-0 top-0 h-[3px] bg-linear-to-r ${theme.strip}`}
        />

        <span className="relative flex items-start justify-between gap-3">
          <span
            className={`flex size-12 shrink-0 items-center justify-center rounded-xl transition duration-300 group-hover:scale-[1.06] group-hover:-rotate-3 ${theme.accent}`}
          >
            <Icon className="size-6" strokeWidth={1.8} />
          </span>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-400 transition duration-300 group-hover:border-transparent group-hover:bg-white group-hover:text-zinc-900">
            <ArrowUpRight className="size-4" />
          </span>
        </span>

        <span className="relative mt-4 block">
          <span className="block truncate text-base font-semibold text-white">{tool.name}</span>
          <span className="mt-1 block text-[13px] leading-5 text-zinc-400">
            {tool.description}
          </span>
        </span>

        {tags}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ animationDelay: `${index * 45}ms` }}
      className={`animate-card-in group relative flex w-full flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-white p-5 text-left shadow-[0_1px_2px_rgba(24,24,27,0.04),0_12px_28px_-20px_rgba(24,24,27,0.25)] transition-all duration-300 outline-none hover:-translate-y-1.5 hover:shadow-[0_2px_4px_rgba(24,24,27,0.05),0_22px_40px_-22px_rgba(24,24,27,0.35)] focus-visible:ring-2 focus-visible:ring-violet-500/40 active:translate-y-0 active:scale-[0.99] ${theme.wash}`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-[3px] bg-linear-to-r ${theme.strip}`}
      />

      <span className="flex items-start justify-between gap-3">
        <span
          className={`flex size-12 shrink-0 items-center justify-center rounded-xl transition duration-300 group-hover:scale-[1.06] group-hover:-rotate-3 ${theme.accent}`}
        >
          <Icon className="size-6" strokeWidth={1.8} />
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-zinc-200/80 bg-white text-zinc-400 transition duration-300 group-hover:border-transparent group-hover:bg-zinc-900 group-hover:text-white">
          <ArrowUpRight className="size-4" />
        </span>
      </span>

      <span className="mt-4 block">
        <span className="block truncate text-[15px] font-semibold text-zinc-900">{tool.name}</span>
        <span className="mt-1 block text-[13px] leading-5 text-zinc-500">{tool.description}</span>
      </span>

      {tags}
    </button>
  )
}

