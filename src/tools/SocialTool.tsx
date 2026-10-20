import { useEffect, useState } from 'react'
import {
  Download,
  Eraser,
  ExternalLink,
  Film,
  History,
  Images,
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
  TextArea,
  buttonClass,
} from '../components/ui'
import type { ToolDefinition } from './types'

type Platform = 'rednote' | 'x'
type MediaType = 'image' | 'video'

type SocialMedia = {
  type: MediaType
  url: string
  fallbackUrls?: string[]
}

type Result = {
  platform: Platform
  id: string
  title: string
  description: string
  author: string
  cover: string
  sourceUrl: string
  media: SocialMedia[]
  warnings: string[]
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; result: Result }

type ErrorResponse = {
  ok?: false
  message?: string
  requestId?: string
  trace?: string[]
}

type HistoryItem = {
  platform: Platform
  id: string
  title: string
  author: string
  input: string
  mediaCount: number
  parsedAt: number
}

const HISTORY_KEY = 'toolbox:social-history:v1'
const HISTORY_MAX = 5
const HISTORY_TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const PLATFORM_LABELS: Record<Platform, string> = {
  rednote: '小红书',
  x: 'X / Twitter',
}

function isPlatform(value: unknown): value is Platform {
  return value === 'rednote' || value === 'x'
}

function isHistoryItem(value: unknown): value is HistoryItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Partial<HistoryItem>
  return (
    isPlatform(item.platform) &&
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.author === 'string' &&
    typeof item.input === 'string' &&
    typeof item.mediaCount === 'number' &&
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

function isHls(url: string) {
  return /\.m3u8(?:$|\?)/i.test(url)
}

function mediaEndpoint(
  media: SocialMedia,
  name: string,
  inline = false,
) {
  const params = new URLSearchParams({
    url: media.url,
    type: media.type,
    name: name.slice(0, 80),
  })
  for (const fallback of media.fallbackUrls?.slice(0, 4) ?? []) {
    params.append('fallback', fallback)
  }
  if (inline) params.set('inline', '1')
  return `/api/social-download?${params.toString()}`
}

function downloadName(result: Result, index: number) {
  return `${result.title}-${PLATFORM_LABELS[result.platform]}-${index + 1}`
}

function SocialTool() {
  const [input, setInput] = useState('')
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

  const parse = async (rawText = input.trim()) => {
    const text = rawText.trim()
    if (!text) return

    setState({ status: 'loading' })
    try {
      const response = await fetch(
        `/api/social?text=${encodeURIComponent(text)}`,
      )
      const body = await response.text()
      let data: ({ ok: true } & Result) | ErrorResponse | null = null
      try {
        data = JSON.parse(body) as ({ ok: true } & Result) | ErrorResponse
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
      if (!data.ok) {
        if (data.trace?.length) {
          console.warn('social resolve trace', data.requestId, data.trace)
        }
        const requestId = data.requestId ? `（请求 ${data.requestId}）` : ''
        throw new Error(
          `${data.message || `解析失败（${response.status}）`}${requestId}`,
        )
      }

      setState({ status: 'done', result: data })
      const nextItem: HistoryItem = {
        platform: data.platform,
        id: data.id,
        title: data.title,
        author: data.author,
        input: text.slice(0, 4000),
        mediaCount: data.media.length,
        parsedAt: Date.now(),
      }
      setHistory((current) =>
        [
          nextItem,
          ...current.filter(
            (item) =>
              item.platform !== nextItem.platform || item.id !== nextItem.id,
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
  const indexedMedia = result?.media.map((media, index) => ({ media, index })) ?? []
  const videos = indexedMedia.filter(({ media }) => media.type === 'video')
  const images = indexedMedia.filter(({ media }) => media.type === 'image')

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
            disabled={input.length === 0 || loading}
          >
            <Eraser className="size-3.5" />
            清空
          </Button>
        }
      >
        <TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="粘贴小红书或 X / Twitter 的分享文案，例如：看看这篇笔记 https://xhslink.com/..."
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
          {loading ? '解析中' : '解析媒体'}
        </Button>
        <span className="rounded-full bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-700">
          小红书
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600">
          X / Twitter
        </span>
        <span className="text-xs text-zinc-400">抖音暂不支持</span>
      </div>

      {state.status === 'error' && <ErrorNote>{state.message}</ErrorNote>}

      {!result && !loading && state.status !== 'error' && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-orange-200 bg-linear-to-br from-orange-50/80 via-white to-rose-50/60 py-10">
          <span className="flex items-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-rose-500 text-white shadow-lg shadow-rose-500/20">
              <Images className="size-5" />
            </span>
            <span className="-ml-1 flex size-10 items-center justify-center rounded-xl border-2 border-white bg-zinc-900 text-white shadow-lg shadow-zinc-900/15">
              <Film className="size-5" />
            </span>
          </span>
          <p className="px-6 text-center text-xs leading-5 text-zinc-500">
            解析公开笔记或帖子，拿到原图与视频下载地址
          </p>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-orange-100 bg-white py-10">
          <LoaderCircle className="size-5 animate-spin text-orange-500" />
          <p className="text-xs text-zinc-400">正在读取公开页面和媒体信息</p>
        </div>
      )}

      {history.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
            <History className="size-3.5 text-orange-500" />
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
                key={`${item.platform}:${item.id}`}
                type="button"
                onClick={() => {
                  setInput(item.input)
                  void parse(item.input)
                }}
                disabled={loading}
                title="重新解析这条记录"
                className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-orange-50/50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                    item.platform === 'rednote'
                      ? 'bg-rose-50 text-rose-600'
                      : 'bg-zinc-100 text-zinc-700'
                  }`}
                >
                  {item.platform === 'rednote' ? (
                    <Images className="size-4" />
                  ) : (
                    <Film className="size-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-zinc-800">
                    {item.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-400">
                    <span>{PLATFORM_LABELS[item.platform]}</span>
                    <span>{item.mediaCount} 个媒体</span>
                    <span>{formatHistoryTime(item.parsedAt)}</span>
                  </span>
                </span>
                <RotateCcw className="size-3.5 shrink-0 text-zinc-300 transition group-hover:text-orange-500" />
              </button>
            ))}
          </div>
        </section>
      )}

      {result && (
        <article className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_14px_34px_-24px_rgba(234,88,12,0.38)]">
          <header className="border-b border-orange-100/80 bg-linear-to-br from-orange-50 via-rose-50/70 to-white p-4">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  result.platform === 'rednote'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-zinc-900 text-white'
                }`}
              >
                {PLATFORM_LABELS[result.platform]}
              </span>
              <span className="font-mono text-[11px] text-zinc-400">{result.id}</span>
              <a
                href={result.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 transition hover:text-orange-600"
              >
                查看原帖
                <ExternalLink className="size-3" />
              </a>
            </div>

            <h3 className="mt-2 line-clamp-2 text-sm leading-6 font-semibold text-zinc-900">
              {result.title}
            </h3>
            {result.author && (
              <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                <UserRound className="size-3.5" />
                <span className="truncate">{result.author}</span>
              </p>
            )}
            {result.description && (
              <p className="mt-2 line-clamp-3 text-xs leading-5 whitespace-pre-wrap text-zinc-600">
                {result.description}
              </p>
            )}
          </header>

          {result.warnings.map((warning) => (
            <p
              key={warning}
              className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[11px] leading-5 text-amber-700"
            >
              {warning}
            </p>
          ))}

          {videos.map(({ media, index }) => {
            const name = downloadName(result, index)
            const playable = !isHls(media.url)
            return (
              <section
                key={media.url}
                className="border-b border-zinc-100 bg-zinc-950 p-3 sm:p-4"
              >
                <div className="overflow-hidden rounded-xl bg-black">
                  {playable ? (
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      poster={
                        result.cover
                          ? mediaEndpoint(
                              { type: 'image', url: result.cover },
                              `${name}-封面`,
                              true,
                            )
                          : undefined
                      }
                      className="mx-auto max-h-[430px] w-full object-contain"
                    >
                      <source src={mediaEndpoint(media, name, true)} />
                    </video>
                  ) : (
                    <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-zinc-400">
                      <Film className="size-6" />
                      <span className="text-xs">该视频只提供了 HLS 播放列表</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={mediaEndpoint(media, name)}
                    download
                    className={buttonClass(
                      'primary',
                      'bg-orange-600 shadow-orange-900/30 hover:bg-orange-500',
                    )}
                  >
                    <Download className="size-3.5" />
                    下载视频
                  </a>
                  <CopyButton value={media.url} label="复制直链" />
                </div>
              </section>
            )
          })}

          {images.length > 0 && (
            <section className="border-b border-zinc-100 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {images.map(({ media, index }) => {
                  const name = downloadName(result, index)
                  return (
                    <figure
                      key={media.url}
                      className="group relative aspect-square overflow-hidden rounded-xl bg-zinc-100"
                    >
                      <img
                        src={mediaEndpoint(media, name, true)}
                        alt={`图片 ${index + 1}`}
                        loading="lazy"
                        className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                      <figcaption className="absolute right-2 bottom-2 left-2 flex items-center justify-between gap-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <span className="rounded-full bg-zinc-950/70 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                          {index + 1}
                        </span>
                        <span className="flex items-center gap-1">
                          <CopyButton
                            value={media.url}
                            iconOnly
                            className="size-8 bg-zinc-950/75 text-white shadow-lg hover:bg-zinc-950 hover:text-white"
                          />
                          <a
                            href={mediaEndpoint(media, name)}
                            download
                            aria-label={`下载图片 ${index + 1}`}
                            title={`下载图片 ${index + 1}`}
                            className="flex size-8 items-center justify-center rounded-lg bg-white text-zinc-900 shadow-lg transition hover:scale-105"
                          >
                            <Download className="size-3.5" />
                          </a>
                        </span>
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
            </section>
          )}

          <p className="bg-zinc-50/70 px-4 py-2.5 text-[11px] leading-5 text-zinc-500">
            媒体由本站 Worker 转发下载。源站直链可能临时失效，下载按钮会重新向源站获取内容。
          </p>
        </article>
      )}
    </div>
  )
}

export const socialTool: ToolDefinition = {
  id: 'social',
  name: '小红书 / X 媒体下载',
  description: '解析公开笔记与帖子，下载原图和视频',
  keywords: [
    'xiaohongshu',
    'xhs',
    'rednote',
    '小红书',
    'x',
    'twitter',
    '推特',
    '图片',
    '视频',
    '下载',
    '解析',
  ],
  tags: ['图片', '视频', '下载'],
  icon: Images,
  theme: {
    accent:
      'bg-linear-to-br from-rose-500 via-orange-500 to-amber-400 text-white shadow-md shadow-orange-500/30',
    strip: 'from-rose-500 via-orange-400 to-amber-300',
    wash: 'hover:border-orange-200 hover:shadow-orange-500/20',
    tag: 'bg-orange-50 text-orange-700',
  },
  wide: true,
  component: SocialTool,
}
