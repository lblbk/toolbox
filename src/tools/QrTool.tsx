import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Eraser, FileCode, QrCode } from 'lucide-react'
import qrcode from 'qrcode-generator'
import { Button, Checkbox, ErrorNote, Field, Segmented, TextArea } from '../components/ui'
import type { ToolDefinition } from './types'

type Level = 'L' | 'M' | 'Q' | 'H'
type Qr = ReturnType<typeof qrcode>

// 库默认逐字符截断成单字节，替换成 UTF-8 编码以支持中文等内容
qrcode.stringToBytes = (text) => Array.from(new TextEncoder().encode(text))

const cellSize = 12
const quietZone = 4

const levels: { value: Level; label: string }[] = [
  { value: 'L', label: 'L' },
  { value: 'M', label: 'M' },
  { value: 'Q', label: 'Q' },
  { value: 'H', label: 'H' },
]

/** 形如 example.com/path 的裸域名，缺协议头 */
function isBareDomain(value: string) {
  return !/\s/.test(value) && /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/i.test(value)
}

function buildQr(content: string, level: Level): Qr {
  const qr = qrcode(0, level)
  qr.addData(content, 'Byte')
  qr.make()
  return qr
}

function toSvg(qr: Qr) {
  const count = qr.getModuleCount()
  const size = (count + quietZone * 2) * cellSize
  let path = ''
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (qr.isDark(row, column)) {
        path += `M${(column + quietZone) * cellSize} ${(row + quietZone) * cellSize}h${cellSize}v${cellSize}h-${cellSize}z`
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`
}

function saveFile(href: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function QrTool() {
  const [input, setInput] = useState('')
  const [level, setLevel] = useState<Level>('M')
  const [autoHttps, setAutoHttps] = useState(true)
  const canvas = useRef<HTMLCanvasElement>(null)

  const content = useMemo(() => {
    const trimmed = input.trim()
    return autoHttps && isBareDomain(trimmed) ? `https://${trimmed}` : trimmed
  }, [input, autoHttps])

  const { qr, error } = useMemo(() => {
    if (!content) return { qr: null, error: null }
    try {
      return { qr: buildQr(content, level), error: null }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      return {
        qr: null,
        error: message.includes('overflow') ? '内容过长，超出二维码容量' : message,
      }
    }
  }, [content, level])

  useEffect(() => {
    const element = canvas.current
    if (!element || !qr) return
    const count = qr.getModuleCount()
    const size = (count + quietZone * 2) * cellSize
    element.width = size
    element.height = size
    const context = element.getContext('2d')
    if (!context) return
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size, size)
    context.fillStyle = '#000000'
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (qr.isDark(row, column)) {
          context.fillRect(
            (column + quietZone) * cellSize,
            (row + quietZone) * cellSize,
            cellSize,
            cellSize,
          )
        }
      }
    }
  }, [qr])

  const downloadSvg = () => {
    if (!qr) return
    const blob = new Blob([toSvg(qr)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    saveFile(url, 'qrcode.svg')
    URL.revokeObjectURL(url)
  }

  const downloadPng = () => {
    const element = canvas.current
    if (!element) return
    saveFile(element.toDataURL('image/png'), 'qrcode.png')
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="space-y-3">
        <Field
          label="链接或文本"
          action={
            <Button
              onClick={() => setInput('')}
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
            placeholder="https://example.com"
            className="h-24"
          />
        </Field>

        <Checkbox checked={autoHttps} onChange={setAutoHttps} label="缺少协议头时自动补全 https://" />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-500">容错级别</span>
          <Segmented value={level} onChange={setLevel} options={levels} />
          <span className="text-xs text-zinc-400">越高越耐遮挡，码也更密</span>
        </div>

        {content && content !== input.trim() && (
          <p className="break-all text-xs leading-5 text-zinc-400">实际编码：{content}</p>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>

      <div className="flex flex-col items-center gap-3">
        {qr ? (
          <>
            <canvas
              ref={canvas}
              role="img"
              aria-label="生成的二维码"
              className="w-full max-w-[15rem] rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-[0_12px_30px_-18px_rgba(24,24,27,0.45)]"
            />
            <div className="flex gap-2">
              <Button onClick={downloadPng}>
                <Download className="size-3.5" />
                PNG
              </Button>
              <Button onClick={downloadSvg}>
                <FileCode className="size-3.5" />
                SVG
              </Button>
            </div>
          </>
        ) : (
          <div className="flex aspect-square w-full max-w-[15rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white/60">
            <QrCode className="size-6 text-zinc-300" />
            <p className="px-6 text-center text-xs leading-5 text-zinc-400">
              输入内容后自动生成二维码
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export const qrTool: ToolDefinition = {
  id: 'qr',
  name: '链接转二维码',
  description: '链接或文本生成二维码，可下载 PNG 与 SVG',
  keywords: ['qr', 'qrcode', '二维码', '链接', 'link', 'url', '扫码'],
  tags: ['链接', '文本'],
  icon: QrCode,
  theme: {
    accent: 'bg-linear-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30',
    strip: 'from-violet-500 to-indigo-600',
    wash: 'hover:shadow-zinc-900/25',
    tag: 'bg-white/10 text-zinc-200',
  },
  featured: true,
  wide: true,
  component: QrTool,
}
