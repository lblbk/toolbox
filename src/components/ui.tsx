import { useEffect, useRef, useState } from 'react'
import { Check, Copy, TriangleAlert } from 'lucide-react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

const controlClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-[0_1px_2px_rgba(24,24,27,0.03)] outline-none transition duration-200 placeholder:text-zinc-400 hover:border-zinc-300 focus:border-violet-300 focus:ring-4 focus:ring-violet-500/10 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:shadow-none'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${className}`} />
}

export function TextArea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      spellCheck={false}
      autoComplete="off"
      {...props}
      className={`${controlClass} resize-y font-mono text-[13px] leading-6 ${className}`}
    />
  )
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} cursor-pointer pr-8 ${className}`} />
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost'
}

const buttonVariants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-zinc-900 text-white shadow-sm shadow-zinc-900/20 hover:bg-zinc-800',
  outline:
    'border border-zinc-200 bg-white text-zinc-700 shadow-[0_1px_2px_rgba(24,24,27,0.04)] hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900',
  ghost: 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900',
}

export function Button({ variant = 'outline', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition duration-150 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${buttonVariants[variant]} ${className}`}
    />
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  return (
    <div
      role="group"
      className={`inline-flex shrink-0 rounded-xl border border-zinc-200/80 bg-zinc-100/80 p-0.5 ${className}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-[10px] px-3 py-1 text-xs font-medium transition ${
            value === option.value
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-zinc-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 cursor-pointer rounded border-zinc-300 accent-violet-600"
      />
      {label}
    </label>
  )
}

export function Field({
  label,
  action,
  children,
  className = '',
}: {
  label?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      {(label || action) && (
        <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2">
          <span className="text-xs font-medium text-zinc-500">{label}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-red-600">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 break-all">{children}</span>
    </p>
  )
}

export function ResultRow({
  label,
  value,
  mono = true,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2">
      <span className="w-16 shrink-0 text-xs leading-6 text-zinc-500">{label}</span>
      <span
        className={`min-w-0 flex-1 break-all text-xs leading-6 text-zinc-800 ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value || '—'}
      </span>
      <CopyButton value={value} iconOnly />
    </div>
  )
}

function fallbackCopy(text: string) {
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  document.body.removeChild(area)
}

export function CopyButton({
  value,
  label = '复制',
  iconOnly = false,
  className = '',
}: {
  value: string
  label?: string
  iconOnly?: boolean
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      fallbackCopy(value)
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1500)
  }

  const Icon = copied ? Check : Copy

  return (
    <Button
      variant="ghost"
      onClick={copy}
      disabled={value.length === 0}
      title={copied ? '已复制' : label}
      aria-label={copied ? '已复制' : label}
      className={iconOnly ? `size-7 shrink-0 px-0 ${className}` : className}
    >
      <Icon className="size-3.5" />
      {!iconOnly && (copied ? '已复制' : label)}
    </Button>
  )
}

