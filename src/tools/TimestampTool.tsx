import { useMemo, useState } from 'react'
import { Clock, RefreshCw } from 'lucide-react'
import { Button, ErrorNote, Field, Input, ResultRow, Segmented } from '../components/ui'
import type { ToolDefinition } from './types'

type Unit = 'auto' | 'seconds' | 'milliseconds'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function toLocalInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function relativeTime(date: Date) {
  const diff = date.getTime() - Date.now()
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(diff) >= size || unit === 'second') {
      return formatter.format(Math.round(diff / size), unit)
    }
  }
  return ''
}

function TimestampTool() {
  const [raw, setRaw] = useState(() => String(Math.floor(Date.now() / 1000)))
  const [unit, setUnit] = useState<Unit>('auto')
  const [local, setLocal] = useState(() => toLocalInput(new Date()))

  const parsed = useMemo(() => {
    const text = raw.trim()
    if (!text) return { error: '输入时间戳' }
    if (!/^-?\d+$/.test(text)) return { error: '时间戳只能是整数' }

    const value = Number(text)
    const milliseconds =
      unit === 'seconds' ? value * 1000 : unit === 'milliseconds' ? value : Math.abs(value) >= 1e11 ? value : value * 1000
    const date = new Date(milliseconds)

    if (Number.isNaN(date.getTime())) return { error: '超出可表示的时间范围' }
    return {
      error: null,
      date,
      milliseconds,
      detected: unit === 'auto' ? (Math.abs(value) >= 1e11 ? '毫秒' : '秒') : unit === 'seconds' ? '秒' : '毫秒',
    }
  }, [raw, unit])

  const localDate = useMemo(() => {
    if (!local) return null
    const date = new Date(local)
    return Number.isNaN(date.getTime()) ? null : date
  }, [local])

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold text-zinc-900">时间戳 → 时间</h3>
          <Segmented
            className="ml-auto"
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'auto', label: '自动' },
              { value: 'seconds', label: '秒' },
              { value: 'milliseconds', label: '毫秒' },
            ]}
          />
        </div>

        <Field
          label="时间戳"
          action={
            <span className="flex items-center gap-2">
              <Button
                onClick={() => {
                  setRaw(String(Math.floor(Date.now() / 1000)))
                  setUnit('seconds')
                }}
              >
                <RefreshCw className="size-3.5" />
                当前秒
              </Button>
              <Button
                onClick={() => {
                  setRaw(String(Date.now()))
                  setUnit('milliseconds')
                }}
              >
                <RefreshCw className="size-3.5" />
                当前毫秒
              </Button>
            </span>
          }
        >
          <Input
            value={raw}
            inputMode="numeric"
            onChange={(event) => setRaw(event.target.value)}
            placeholder="1735689600"
            className="font-mono"
          />
        </Field>

        {parsed.error && <ErrorNote>{parsed.error}</ErrorNote>}

        {parsed.date && (
          <div className="space-y-1.5">
            <ResultRow label="本地时间" value={parsed.date.toLocaleString('zh-CN', { hour12: false })} mono={false} />
            <ResultRow label="ISO 8601" value={parsed.date.toISOString()} />
            <ResultRow label="UTC" value={parsed.date.toUTCString()} mono={false} />
            <ResultRow label="相对" value={relativeTime(parsed.date)} mono={false} />
            <p className="px-1 pt-0.5 text-xs text-zinc-400">
              按{parsed.detected}解析 · {parsed.milliseconds} ms
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-zinc-100 pt-5">
        <h3 className="text-xs font-semibold text-zinc-900">时间 → 时间戳</h3>
        <Field
          label="本地时间"
          action={
            <Button onClick={() => setLocal(toLocalInput(new Date()))}>
              <Clock className="size-3.5" />
              现在
            </Button>
          }
        >
          <Input
            type="datetime-local"
            value={local}
            onChange={(event) => setLocal(event.target.value)}
            className="font-mono"
          />
        </Field>
        {localDate ? (
          <div className="space-y-1.5">
            <ResultRow label="秒" value={String(Math.floor(localDate.getTime() / 1000))} />
            <ResultRow label="毫秒" value={String(localDate.getTime())} />
          </div>
        ) : (
          <ErrorNote>请输入合法的日期时间</ErrorNote>
        )}
      </section>
    </div>
  )
}

export const timestampTool: ToolDefinition = {
  id: 'timestamp',
  name: '时间戳转换',
  description: 'Unix 时间戳与本地时间、ISO 8601 互转',
  keywords: ['timestamp', 'unix', 'time', 'date', 'iso8601', 'utc', '时间戳', '时间', '日期'],
  tags: ['Unix', 'ISO 8601'],
  icon: Clock,
  theme: {
    accent: 'bg-linear-to-br from-emerald-400 to-teal-600 text-white shadow-md shadow-emerald-500/25',
    strip: 'from-emerald-400 to-teal-600',
    wash: 'hover:border-emerald-200 hover:shadow-emerald-500/15',
    tag: 'bg-emerald-50 text-emerald-700',
  },
  component: TimestampTool,
}
