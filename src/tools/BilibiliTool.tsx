import { useState } from 'react'
import { Download, Eraser, Film, LoaderCircle, Sparkles, UserRound } from 'lucide-react'
import { Button, CopyButton, ErrorNote, Field, TextArea, buttonClass } from '../components/ui'
import type { ToolDefinition } from './types'

type File = { url: string; size: number; order: number }

type Result = {
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
  const [state, setState] = useState<State>({ status: 'idle' })

  const parse = async () => {
    const text = input.trim()
    if (!text) return
    setState({ status: 'loading' })
    try {
      const response = await fetch(`/api/bili?text=${encodeURIComponent(text)}`)
      if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
        throw new Error('没有找到解析接口，本地预览请用 npx wrangler pages dev')
      }
      const data = (await response.json()) as ({ ok: true } & Result) | { ok?: false; message?: string }
      if (!data.ok) throw new Error(data.message || `解析失败（${response.status}）`)
      setState({ status: 'done', result: data })
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
        <Button variant="primary" onClick={parse} disabled={loading || !input.trim()}>
          {loading ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {loading ? '解析中' : '解析链接'}
        </Button>
        <span className="text-xs text-zinc-400">支持 BV 号、完整链接和 b23.tv 短链</span>
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
          <p className="text-xs text-zinc-400">正在向 B 站请求视频地址</p>
        </div>
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
                    {result.quality}
                  </span>
                )}
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
  description: '粘贴分享链接，拿到可直接下载的视频地址',
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
