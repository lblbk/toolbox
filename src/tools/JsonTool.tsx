import { useState } from 'react'
import { AlignLeft, Braces, Eraser, ListTree, Minimize2 } from 'lucide-react'
import { Button, CopyButton, ErrorNote, Field, TextArea } from '../components/ui'
import type { ToolDefinition } from './types'

const sample = `{
  "name": "工具箱",
  "tools": ["qr", "json", "base64", "timestamp"],
  "local": true
}`

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((result, [key, item]) => {
        result[key] = sortKeys(item)
        return result
      }, {})
  }
  return value
}

function JsonTool() {
  const [input, setInput] = useState(sample)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = (format: (value: unknown) => string) => {
    if (!input.trim()) {
      setOutput('')
      setError(null)
      return
    }
    try {
      setOutput(format(JSON.parse(input)))
      setError(null)
    } catch (err) {
      setOutput('')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => run((value) => JSON.stringify(value, null, 2))}>
          <AlignLeft className="size-3.5" />
          格式化
        </Button>
        <Button onClick={() => run((value) => JSON.stringify(value))}>
          <Minimize2 className="size-3.5" />
          压缩
        </Button>
        <Button onClick={() => run((value) => JSON.stringify(sortKeys(value), null, 2))}>
          <ListTree className="size-3.5" />
          键排序
        </Button>
        <Button
          className="ml-auto"
          onClick={() => {
            setInput('')
            setOutput('')
            setError(null)
          }}
        >
          <Eraser className="size-3.5" />
          清空
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="输入">
          <TextArea
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              setError(null)
            }}
            placeholder="粘贴 JSON…"
            className="h-56 sm:h-80"
          />
          {error && <ErrorNote>{error}</ErrorNote>}
        </Field>
        <Field label="输出" action={<CopyButton value={output} />}>
          <TextArea
            value={output}
            readOnly
            placeholder="结果会显示在这里"
            className="h-56 bg-zinc-50 text-zinc-700 sm:h-80"
          />
        </Field>
      </div>
    </div>
  )
}

export const jsonTool: ToolDefinition = {
  id: 'json',
  name: 'JSON 格式化',
  description: '格式化、压缩、键排序与语法校验',
  keywords: ['json', 'format', 'beautify', 'minify', 'pretty', '格式化', '压缩', '校验'],
  tags: ['格式化', '校验'],
  icon: Braces,
  theme: {
    accent: 'bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-orange-500/25',
    strip: 'from-amber-400 to-orange-500',
    wash: 'hover:border-amber-200 hover:shadow-orange-500/15',
    tag: 'bg-amber-50 text-amber-700',
  },
  wide: true,
  component: JsonTool,
}

