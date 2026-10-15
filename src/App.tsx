import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Wrench, X } from 'lucide-react'
import { ToolCard } from './components/ToolCard'
import { ToolModal } from './components/ToolModal'
import { Button } from './components/ui'
import { useActiveTool } from './hooks/useActiveTool'
import { tools } from './tools'

export default function App() {
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const { activeTool, open, close } = useActiveTool(tools)

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return tools
    return tools.filter((tool) => {
      const haystack = [tool.name, tool.description, tool.id, ...tool.keywords].join(' ').toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
  }, [query])

  useEffect(() => {
    document.title = activeTool ? `${activeTool.name} · 工具箱` : '工具箱'
  }, [activeTool])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || activeTool) return
      const target = event.target
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (typing) return
      event.preventDefault()
      searchInput.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTool])

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div
        aria-hidden="true"
        className="bg-dots pointer-events-none fixed inset-x-0 top-0 -z-10 h-[34rem] opacity-70 [mask-image:linear-gradient(180deg,black,transparent)]"
      />

      <header className="sticky top-0 z-30 border-b border-zinc-900/5 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 via-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/30">
              <Wrench className="size-[18px]" strokeWidth={2} />
            </span>
            <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900">工具箱</h1>
          </div>

          <div className="relative ml-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              ref={searchInput}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query) {
                  event.stopPropagation()
                  setQuery('')
                }
              }}
              placeholder="搜索工具"
              aria-label="搜索工具"
              className="h-9 w-full rounded-xl border border-zinc-200/80 bg-white/80 pr-8 pl-8 text-sm text-zinc-900 shadow-sm outline-none transition duration-200 placeholder:text-zinc-400 focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-500/15 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  searchInput.current?.focus()
                }}
                aria-label="清除搜索"
                className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
        {filtered.length > 0 ? (
          <>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
                  {query.trim() ? '搜索结果' : '全部工具'}
                </h2>
                <p className="mt-1 text-[13px] text-zinc-500">
                  全部在浏览器本地运行，数据不会上传
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-zinc-200/80 bg-white px-2.5 py-1 text-xs font-medium text-zinc-500 shadow-sm">
                {filtered.length} 个
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((tool, index) => (
                <ToolCard key={tool.id} tool={tool} index={index} onOpen={() => open(tool.id)} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white/60 py-16">
            <Search className="size-5 text-zinc-300" />
            <p className="text-sm text-zinc-500">没有找到与「{query}」匹配的工具</p>
            <Button onClick={() => setQuery('')}>清空搜索</Button>
          </div>
        )}
      </main>

      <footer className="mx-auto w-full max-w-4xl px-4 pb-8 sm:px-6">
        <p className="text-xs text-zinc-400">工具箱 · {tools.length} 个本地小工具</p>
      </footer>

      {activeTool && <ToolModal tool={activeTool} onClose={close} />}
    </div>
  )
}
