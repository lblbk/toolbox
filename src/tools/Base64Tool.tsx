import { useMemo, useState } from 'react'
import { ArrowLeftRight, Binary, Eraser } from 'lucide-react'
import { Button, Checkbox, CopyButton, ErrorNote, Field, Segmented, TextArea } from '../components/ui'
import type { ToolDefinition } from './types'

type Direction = 'encode' | 'decode'

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function Base64Tool() {
  const [input, setInput] = useState('')
  const [direction, setDirection] = useState<Direction>('encode')
  const [urlSafe, setUrlSafe] = useState(false)

  const result = useMemo(() => {
    if (!input.trim()) return { value: '', error: null }
    try {
      if (direction === 'encode') {
        const base64 = bytesToBase64(new TextEncoder().encode(input))
        const value = urlSafe ? base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : base64
        return { value, error: null }
      }
      const normalized = input.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
      const value = new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(padded))
      return { value, error: null }
    } catch {
      return {
        value: '',
        error: direction === 'encode' ? '编码失败' : '不是合法的 Base64，或解码结果不是 UTF-8 文本',
      }
    }
  }, [direction, input, urlSafe])

  const swap = () => {
    if (!result.value) return
    setInput(result.value)
    setDirection(direction === 'encode' ? 'decode' : 'encode')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'encode', label: '编码' },
            { value: 'decode', label: '解码' },
          ]}
        />
        <Checkbox checked={urlSafe} onChange={setUrlSafe} label="URL 安全" />
        <Button className="ml-auto" onClick={swap} disabled={!result.value}>
          <ArrowLeftRight className="size-3.5" />
          交换
        </Button>
        <Button onClick={() => setInput('')} disabled={!input}>
          <Eraser className="size-3.5" />
          清空
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={direction === 'encode' ? '原文' : 'Base64'}>
          <TextArea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={direction === 'encode' ? '输入要编码的文本' : '粘贴 Base64 字符串'}
            className="h-56 sm:h-80"
          />
          {result.error && <ErrorNote>{result.error}</ErrorNote>}
        </Field>
        <Field
          label={direction === 'encode' ? 'Base64' : '原文'}
          action={<CopyButton value={result.value} />}
        >
          <TextArea
            value={result.value}
            readOnly
            placeholder="结果会显示在这里"
            className="h-56 bg-zinc-50 text-zinc-700 sm:h-80"
          />
        </Field>
      </div>
    </div>
  )
}

export const base64Tool: ToolDefinition = {
  id: 'base64',
  name: 'Base64 编解码',
  description: '文本与 Base64 互转，支持 URL 安全变体',
  keywords: ['base64', 'encode', 'decode', 'b64', 'urlsafe', '编码', '解码', '转码'],
  tags: ['编码', '解码'],
  icon: Binary,
  theme: {
    accent: 'bg-linear-to-br from-sky-400 to-blue-600 text-white shadow-md shadow-blue-500/25',
    strip: 'from-sky-400 to-blue-600',
    wash: 'hover:border-sky-200 hover:shadow-blue-500/15',
    tag: 'bg-sky-50 text-sky-700',
  },
  wide: true,
  component: Base64Tool,
}

