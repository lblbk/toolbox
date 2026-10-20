import { useEffect, useState } from 'react'
import {
  Download,
  Eraser,
  Film,
  History,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react'
import {
  Button,
  CopyButton,
  ErrorNote,
  Field,
  Select,
  TextArea,
  buttonClass,
} from '../components/ui'
import type { ToolDefinition } from './types'

type File = { url: string; size: number; order: number }
type Quality = 16 | 32 | 64 | 80
type Source = 'biliapi' | 'injahow' | 'nekocha'

type Result = {
  source: Source
  bvid: string
  title: string
  cover: string
  up: string
  duration: number
  quality: string
  files: File[]
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; result: Result }

type HistoryItem = {
  bvid: string
  title: string
  cover: string
  up: string
  duration: number
  quality: string
  qn: Quality
  source: Source
  input: string
  parsedAt: number
}

const DEFAULT_QUALITY: Quality = 64
const HISTORY_KEY = 'toolbox:bilibili-history:v1'
const HISTORY_MAX = 6
const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: 16, label: '360P' },
  { value: 32, label: '480P' },
  { value: 64, label: '720P' },
  { value: 80, label: '1080P' },
]
const SOURCE_LABELS: Record<Source, string> = {
  biliapi: '自建线路',
  injahow: '备用线路 1',
  nekocha: '备用线路 2',
}
const HISTORY_TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function isQuality(value: unknown): value is Quality {
  return value === 16 || value === 32 || value === 64 || value === 80
}

function isSource(value: unknown): value is Source {
  return value === 'biliapi' || value === 'injahow' || value === 'nekocha'
}

function isHistoryItem(value: unknown): value is HistoryItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Partial<HistoryItem>
  return (
    typeof item.bvid === 'string' &&
    typeof item.title === 'string' &&
    typeof item.cover === 'string' &&
    typeof item.up === 'string' &&
    typeof item.duration === 'number' &&
    typeof item.quality === 'string' &&
    isQuality(item.qn) &&
    isSource(item.source) &&
    typeof item.input === 'string' &&
    typeof item.parsedAt === 'number'
  )
}

function loadHistory() {
  try {
    const value = window.localStorage.getItem(HISTORY_KEY)
    if (!value) return []
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter(isHistoryItem).slice(0, HISTORY_MAX)
      : []
  } catch {
    return []
  }
}

function formatHistoryTime(value: number) {
  if (!Number.isFinite(value)) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : HISTORY_TIME_FORMAT.format(date)
}

function formatDuration(seconds: number) {
  if (!seconds) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`
}

function formatSize(bytes: number) {
  if (!bytes) return ''
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function BilibiliTool() {
  const [input, setInput] = useState('')
  const [quality, setQuality] = useState<Quality>(DEFAULT_QUALITY)
  const [state, setState] = useState<State>({ status: 'idle' })
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory)

  useEffect(() => {
    try {
      if (history.length === 0) {
        window.localStorage.removeItem(HISTORY_KEY)
      } else {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
      }
    } catch {
      // History is optional when browser storage is unavailable.
    }
  }, [history])

  const parse = async (rawText = input.trim(), requestedQuality = quality) => {
    const text = rawText.trim()
    if (!text) return
    setState({ status: 'loading' })
    try {
      const response = await fetch(
        `/api/bili?text=${encodeURIComponent(text)}&qn=${requestedQuality}`,
      )
      const body = await response.text()
      let data: ({ ok: true } & Result) | { ok?: false; message?: string } | null = null
      try {
        data = JSON.parse(body) as ({ ok: true } & Result) | { ok?: false; message?: string }
      } catch {
        data = null
      }
      if (!data) {
        throw new Error(
          response.status === 404
            ? '没有找到解析接口，请确认 Cloudflare Worker 已部署'
            : `接口返回 ${response.status}：${body.trim().slice(0, 120) || '空响应'}`,
        )
      }
      if (!data.ok) throw new Error(data.message || `解析失败（${response.status}）`)
      setState({ status: 'done', result: data })
      const requestedLabel =
        QUALITY_OPTIONS.find((option) => option.value === requestedQuality)?.label ?? ''
      const nextItem: HistoryItem = {
        bvid: data.bvid,
        title: data.title,
        cover: data.cover,
        up: data.up,
        duration: data.duration,
        quality: data.quality || requestedLabel,
        qn: requestedQuality,
        source: data.source,
        input: text.slice(0, 4000),
        parsedAt: Date.now(),
      }
      setHistory((current) =>
        [
          nextItem,
          ...current.filter(
            (item) => item.bvid !== nextItem.bvid || item.qn !== nextItem.qn,
          ),
        ].slice(0, HISTORY_MAX),
      )
    } catch (reason) {
      setState({
        status: 'error',
        message: reason instanceof Error ? reason.message : '解析失败，请稍后重试',
      })
    }
  }

  const loading = state.status === 'loading'
  const result = state.status === 'done' ? state.result : null

  return (
    <div className="space-y-4">
      <Field
        label="分享链接或分享文案"
        action={
          <Button
            onClick={() => {
              setInput('')
              setState({ status: 'idle' })
            }}
            disabled={input.length === 0}
          >
            <Eraser className="size-3.5" />
            清空
          </Button>
        }
      >
        <TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="【现在ai做真人短剧真的是越来越真实了！】 https://www.bilibili.com/video/BV1P88w6xE2u/?share_source=copy_web"
          className="h-24"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={() => void parse()}
          disabled={loading || !input.trim()}
        >
          {loading ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {loading ? '解析中' : '解析链接'}
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="whitespace-nowrap">清晰度</span>
          <span className="block w-28">
            <Select
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value) as Quality)}
              disabled={loading}
              aria-label="视频清晰度"
              className="h-8 py-0"
            >
              {QUALITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </span>
        </label>
        <span className="text-xs text-zinc-400">
          1080P 不可用时会自动降到最近档位
        </span>
      </div>

      {state.status === 'error' && <ErrorNote>{state.message}</ErrorNote>}

      {!result && !loading && state.status !== 'error' && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white/60 py-10">
          <Film className="size-6 text-zinc-300" />
          <p className="px-6 text-center text-xs leading-5 text-zinc-400">
            粘贴分享链接后点击解析，拿到可直接下载的视频地址
          </p>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white py-10">
          <LoaderCircle className="size-5 animate-spin text-rose-500" />
          <p className="text-xs text-zinc-400">正在请求解析服务</p>
        </div>
      )}

      {history.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
            <History className="size-3.5 text-rose-500" />
            <span className="text-xs font-medium text-zinc-700">最近解析</span>
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
              {history.length}
            </span>
            <span className="ml-auto hidden text-[11px] text-zinc-400 sm:inline">
              仅保存在当前浏览器
            </span>
            <Button
              variant="ghost"
              onClick={() => setHistory([])}
              disabled={loading}
              className="ml-auto h-7 px-2 sm:ml-1"
            >
              <Trash2 className="size-3.5" />
              清空
            </Button>
          </div>
          <div className="divide-y divide-zinc-100">
            {history.map((item) => (
              <button
                key={`${item.bvid}-${item.qn}`}
                type="button"
                onClick={() => {
                  setInput(item.input)
                  setQuality(item.qn)
                  void parse(item.input, item.qn)
                }}
                disabled={loading}
                title="重新解析这条记录"
                className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-rose-50/50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
              >
                <span className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                  {item.cover ? (
                    <img
                      src={item.cover}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center">
                      <Film className="size-4 text-zinc-300" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-zinc-800">
                    {item.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-400">
                    <span className="font-mono">{item.bvid}</span>
                    {item.quality && (
                      <span className="rounded-full bg-rose-50 px-1.5 py-0.5 font-medium text-rose-600">
                        {item.quality}
                      </span>
                    )}
                    <span>{SOURCE_LABELS[item.source]}</span>
                    <span>{formatHistoryTime(item.parsedAt)}</span>
                  </span>
                </span>
                <RotateCcw className="size-3.5 shrink-0 text-zinc-300 transition group-hover:text-rose-500" />
              </button>
            ))}
          </div>
        </section>
      )}

      {result && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_14px_34px_-24px_rgba(24,24,27,0.45)]">
          <div className="flex flex-col gap-3 p-3 sm:flex-row sm:p-4">
            <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-zinc-100 sm:w-52">
              {result.cover ? (
                <img
                  src={result.cover}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center">
                  <Film className="size-6 text-zinc-300" />
                </span>
              )}
              {formatDuration(result.duration) && (
                <span className="absolute right-1.5 bottom-1.5 rounded-md bg-zinc-950/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {formatDuration(result.duration)}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm leading-5 font-medium text-zinc-900">
                {result.title}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                {result.up && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <UserRound className="size-3.5 shrink-0" />
                    <span className="truncate">{result.up}</span>
                  </span>
                )}
                <span className="font-mono">{result.bvid}</span>
                {result.quality && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">
                    实际 {result.quality}
                  </span>
                )}
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-500">
                  {SOURCE_LABELS[result.source]}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {result.files.map((file, index) => (
                  <div key={file.url} className="flex items-center gap-2">
                    {result.files.length > 1 && (
                      <span className="shrink-0 text-xs text-zinc-500">
                        第 {index + 1} 段
                        <span className="ml-1 text-zinc-400">{formatSize(file.size)}</span>
                      </span>
                    )}
                    <a
                      href={`/api/bili-download?url=${encodeURIComponent(file.url)}&name=${encodeURIComponent(
                        `${result.title}${result.files.length > 1 ? `-${index + 1}` : ''}`,
                      )}`}
                      download
                      className={buttonClass('primary')}
                    >
                      <Download className="size-3.5" />
                      {result.files.length > 1 ? '下载本段' : '下载视频'}
                    </a>
                    <CopyButton value={file.url} label="复制直链" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="border-t border-zinc-100 bg-zinc-50/70 px-3 py-2.5 text-[11px] leading-5 text-zinc-500 sm:px-4">
            直链是 B 站 CDN 的临时地址，会过期也可能被风控拦截，建议用「下载视频」由本站转发下载。
          </p>
        </div>
      )}
    </div>
  )
}

export const bilibiliTool: ToolDefinition = {
  id: 'bilibili',
  name: 'B 站视频下载',
  description: '选择清晰度解析分享链接，并保留本机最近记录',
  keywords: ['bilibili', 'b站', '哔哩哔哩', '视频', '下载', '解析', 'bv', 'video', 'download'],
  tags: ['视频', '下载'],
  icon: Film,
  theme: {
    accent: 'bg-linear-to-br from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/30',
    strip: 'from-rose-500 via-pink-500 to-fuchsia-500',
    wash: 'hover:border-rose-200 hover:shadow-rose-500/20',
    tag: 'bg-rose-50 text-rose-700',
  },
  wide: true,
  component: BilibiliTool,
}
