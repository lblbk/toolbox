/**
 * Cloudflare Worker：托管静态站点，并通过 B 站解析服务获取视频地址。
 *
 * B 站会限制 Cloudflare 的出口 IP，因此这里不直接请求 api.bilibili.com。
 * 优先使用自建 biliapi，失败时再调用公开服务作为备用。
 */

import { handleSocialDownload, handleSocialResolve } from './social'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const BVID_RE = /BV[0-9A-Za-z]{10}/
const SHORT_LINK_RE = /https?:\/\/b23\.tv\/[0-9A-Za-z]+/
const OWN_BILI_API = 'https://biliapi.lblbk.top/api/video'
const INJAHOW_API = 'https://api.injahow.cn/bparse/'
const NEKOCHA_API = 'https://bili.nekocha.top/video'
const ALLOWED_DOWNLOAD_HOSTS = [
  'biliapi.lblbk.top',
  'bilivideo.com',
  'bilivideo.cn',
  'akamaized.net',
  'bilibili.com',
]
const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag']
const CACHE_TTL = 10 * 60 * 1000
const CACHE_MAX = 80
const QUALITY_VALUES = [16, 32, 64, 80] as const
const DEFAULT_QUALITY: Quality = 64

type Quality = (typeof QUALITY_VALUES)[number]

type Env = {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

type JsonObject = Record<string, unknown>

type VideoFile = {
  url: string
  size: number
  order: number
}

type ParseResult = {
  source: 'biliapi' | 'injahow' | 'nekocha'
  bvid: string
  title: string
  cover: string
  up: string
  duration: number
  quality: string
  files: VideoFile[]
}

type CacheEntry = {
  expiresAt: number
  result: ParseResult
}

const resultCache = new Map<string, CacheEntry>()

const reply = (data: unknown, status = 200, requestId = '') => {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  })
  if (requestId) headers.set('x-request-id', requestId)
  return new Response(JSON.stringify(data), { status, headers })
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const textValue = (value: unknown) => (typeof value === 'string' ? value : '')

function qualityLabel(value: unknown) {
  const labels: Record<number, string> = {
    6: '240P',
    16: '360P',
    32: '480P',
    64: '720P',
    74: '720P60',
    80: '1080P',
    100: '智能修复',
    112: '1080P+',
    116: '1080P60',
    120: '4K',
    125: 'HDR',
    126: '杜比视界',
    127: '8K',
  }
  const quality = Number(value)
  return Number.isFinite(quality) ? (labels[quality] ?? String(quality)) : ''
}

function parseQuality(value: string | null): Quality {
  const quality = Number(value)
  return QUALITY_VALUES.includes(quality as Quality) ? (quality as Quality) : DEFAULT_QUALITY
}

function cacheKey(bvid: string, quality: Quality) {
  return `${bvid}:${quality}`
}

function cachedResult(bvid: string, quality: Quality) {
  const key = cacheKey(bvid, quality)
  const cached = resultCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    resultCache.delete(key)
    return null
  }
  return cached.result
}

function cacheResult(bvid: string, quality: Quality, result: ParseResult) {
  if (resultCache.size >= CACHE_MAX) {
    const oldest = resultCache.keys().next().value
    if (oldest) resultCache.delete(oldest)
  }
  resultCache.set(cacheKey(bvid, quality), {
    expiresAt: Date.now() + CACHE_TTL,
    result,
  })
}

async function resolveBvid(raw: string, requestId: string, trace: string[]) {
  const direct = raw.match(BVID_RE)?.[0]
  if (direct) return direct

  const short = raw.match(SHORT_LINK_RE)?.[0]
  if (!short) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const started = Date.now()
    const response = await fetch(short, {
      headers: { 'user-agent': UA },
      redirect: 'follow',
      signal: controller.signal,
    })
    const bvid = response.url.match(BVID_RE)?.[0] ?? (await response.text()).match(BVID_RE)?.[0]
    trace.push(
      `b23.tv -> HTTP ${response.status} ${bvid ? `BV ${bvid}` : '未找到 BV 号'} (${Date.now() - started}ms)`,
    )
    console.log('bili parse: short link', {
      requestId,
      status: response.status,
      bvid: bvid ?? '',
      elapsedMs: Date.now() - started,
    })
    return bvid ?? null
  } catch (reason) {
    const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
    trace.push(`b23.tv -> 请求失败：${message}`)
    console.warn('bili parse: short link failed', { requestId, message })
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function publicJson(
  url: URL,
  source: string,
  requestId: string,
  trace: string[],
  timeoutMs = 10_000,
) {
  const started = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent': UA,
      },
      signal: controller.signal,
    })
    const body = await response.text()
    let data: JsonObject | null = null
    try {
      const parsed: unknown = JSON.parse(body)
      data = isObject(parsed) ? parsed : null
    } catch {
      data = null
    }

    const elapsedMs = Date.now() - started
    const detail = data
      ? `HTTP ${response.status} code ${String(data.code ?? data.status ?? '-')} ${textValue(data.message)}`.trim()
      : `HTTP ${response.status} 非 JSON：${body.trim().slice(0, 120) || '空响应'}`
    trace.push(`${source} -> ${detail} (${elapsedMs}ms)`)
    console.log('bili parse: upstream', {
      requestId,
      source,
      status: response.status,
      code: data?.code ?? null,
      json: Boolean(data),
      elapsedMs,
    })
    return { data }
  } catch (reason) {
    const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
    trace.push(`${source} -> 请求失败：${message} (${Date.now() - started}ms)`)
    console.warn('bili parse: upstream failed', {
      requestId,
      source,
      message,
      elapsedMs: Date.now() - started,
    })
    return { data: null }
  } finally {
    clearTimeout(timeout)
  }
}

function unwrapOwnProxy(value: string) {
  try {
    const proxy = new URL(value)
    if (
      proxy.protocol !== 'https:' ||
      proxy.hostname !== 'biliapi.lblbk.top' ||
      proxy.pathname !== '/proxy'
    ) {
      return value
    }

    const target = proxy.searchParams.get('url')
    return target && validVideoUrl(target) ? target : value
  } catch {
    return value
  }
}

function normalizeOwnParser(
  data: JsonObject | null,
  requestedQuality: Quality,
): ParseResult | null {
  if (!data || data.status !== 'success') return null

  const bvid = textValue(data.bvid)
  const sourceUrl = textValue(data.downloadUrl) || textValue(data.playableUrl)
  const fileUrl = unwrapOwnProxy(sourceUrl)
  if (!BVID_RE.test(bvid) || !validVideoUrl(fileUrl)) return null

  return {
    source: 'biliapi',
    bvid,
    title: textValue(data.title) || `B 站视频 ${bvid}`,
    cover: textValue(data.pic).replace(/^http:/, 'https:'),
    up: textValue(data.author),
    duration: 0,
    quality: qualityLabel(data.quality) || qualityLabel(requestedQuality),
    files: [{ url: fileUrl, size: 0, order: 1 }],
  }
}

function validVideoUrl(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false
  try {
    const { hostname } = new URL(value)
    return ALLOWED_DOWNLOAD_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    )
  } catch {
    return false
  }
}

async function tryOwnParser(
  raw: string,
  quality: Quality,
  requestId: string,
  trace: string[],
) {
  const url = new URL(OWN_BILI_API)
  url.searchParams.set('text', raw)
  url.searchParams.set('qn', String(quality))

  const response = await publicJson(url, 'biliapi', requestId, trace, 25_000)
  return normalizeOwnParser(response.data, quality)
}

function normalizeInjahow(
  data: JsonObject | null,
  bvid: string,
  requestedQuality: Quality,
): ParseResult | null {
  if (!data || data.code !== 0 || !validVideoUrl(data.url)) return null

  return {
    source: 'injahow',
    bvid,
    title: `B 站视频 ${bvid}`,
    cover: '',
    up: '',
    duration: 0,
    quality: qualityLabel(data.quality) || qualityLabel(requestedQuality),
    files: [{ url: data.url as string, size: 0, order: 1 }],
  }
}

function normalizeNekocha(
  data: JsonObject | null,
  bvid: string,
  requestedQuality: Quality,
): ParseResult | null {
  if (!data || data.code !== 200 || !isObject(data.data)) return null

  const detail = data.data
  const play = isObject(detail.play) ? detail.play : null
  if (!play || !validVideoUrl(play.url)) return null

  const owner = isObject(detail.owner) ? detail.owner : null
  return {
    source: 'nekocha',
    bvid: textValue(detail.bvid) || bvid,
    title: textValue(detail.title) || `B 站视频 ${bvid}`,
    cover: textValue(detail.pic).replace(/^http:/, 'https:'),
    up: textValue(owner?.name),
    duration: Number(detail.duration) || 0,
    quality:
      qualityLabel(play.realQuality ?? play.quality) || qualityLabel(requestedQuality),
    files: [{ url: play.url as string, size: 0, order: 1 }],
  }
}

async function tryPublicParsers(
  bvid: string,
  quality: Quality,
  requestId: string,
  trace: string[],
) {
  const injahow = new URL(INJAHOW_API)
  injahow.searchParams.set('bv', bvid)
  injahow.searchParams.set('p', '1')
  injahow.searchParams.set('q', String(quality))
  injahow.searchParams.set('format', 'mp4')
  injahow.searchParams.set('otype', 'json')

  const fast = await publicJson(injahow, 'injahow', requestId, trace)
  const fastResult = normalizeInjahow(fast.data, bvid, quality)
  if (fastResult) return fastResult

  const nekocha = new URL(`${NEKOCHA_API}/${encodeURIComponent(bvid)}`)
  nekocha.searchParams.set('type', 'json')
  nekocha.searchParams.set('format', 'mp4')
  nekocha.searchParams.set('qn', String(quality))

  const full = await publicJson(nekocha, 'nekocha', requestId, trace)
  return normalizeNekocha(full.data, bvid, quality)
}

async function handleBili(request: Request): Promise<Response> {
  const started = Date.now()
  const params = new URL(request.url).searchParams
  const debug = params.has('debug')
  const quality = parseQuality(params.get('qn'))
  const requestId = request.headers.get('cf-ray') || crypto.randomUUID()
  const trace: string[] = []

  console.log('bili parse: request', {
    requestId,
    debug,
    quality,
    hasText: params.has('text'),
    hasBvid: params.has('bvid'),
  })

  const fail = (message: string, status: number) => {
    const payload = { ok: false, requestId, message, ...(debug ? { trace } : {}) }
    const details = { requestId, status, message, trace, elapsedMs: Date.now() - started }
    if (status >= 500) console.error('bili parse: response', details)
    else console.log('bili parse: response', details)
    return reply(payload, status, requestId)
  }

  try {
    const raw = `${params.get('text') ?? ''} ${params.get('bvid') ?? ''}`.trim()
    if (!raw) return fail('没有收到链接', 400)

    const directBvid = raw.match(BVID_RE)?.[0]
    const cached = debug || !directBvid ? null : cachedResult(directBvid, quality)
    if (cached) {
      console.log('bili parse: cache hit', {
        requestId,
        bvid: cached.bvid,
        quality,
        source: cached.source,
      })
      return reply({ ok: true, requestId, ...cached }, 200, requestId)
    }

    const success = (result: ParseResult) => {
      cacheResult(result.bvid, quality, result)
      console.log('bili parse: success', {
        requestId,
        bvid: result.bvid,
        source: result.source,
        requestedQuality: quality,
        actualQuality: result.quality,
        elapsedMs: Date.now() - started,
      })
      return reply(
        {
          ok: true,
          requestId,
          ...result,
          ...(debug ? { trace } : {}),
        },
        200,
        requestId,
      )
    }

    const own = await tryOwnParser(raw, quality, requestId, trace)
    if (own) return success(own)

    const bvid = directBvid ?? (await resolveBvid(raw, requestId, trace))
    if (!bvid) return fail('没找到 BV 号，请粘贴完整的分享链接', 400)

    const result = await tryPublicParsers(bvid, quality, requestId, trace)
    if (!result) {
      return fail('解析服务暂时不可用，请稍后重试', 502)
    }

    return success(result)
  } catch (reason) {
    const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
    console.error('bili parse: failed', {
      requestId,
      message,
      trace,
      elapsedMs: Date.now() - started,
    })
    return fail(`解析失败：${message}`, 502)
  }
}

function allowedDownload(target: string) {
  try {
    const { protocol, hostname } = new URL(target)
    return (
      protocol === 'https:' &&
      ALLOWED_DOWNLOAD_HOSTS.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`),
      )
    )
  } catch {
    return false
  }
}

function asciiName(value: string) {
  return value.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'bilibili-video'
}

async function handleDownload(request: Request): Promise<Response> {
  const fail = (message: string, status: number) =>
    reply({ ok: false, message }, status)

  try {
    const params = new URL(request.url).searchParams
    const target = params.get('url') ?? ''
    if (!allowedDownload(target)) return fail('地址不在允许范围内', 400)

    const host = new URL(target).hostname
    const range = request.headers.get('range')
    console.log('bili download: start', { host, range: range ?? 'full' })

    const upstream = await fetch(target, {
      headers: {
        'user-agent': UA,
        referer: 'https://www.bilibili.com/',
        origin: 'https://www.bilibili.com',
        ...(range ? { range } : {}),
      },
    })

    console.log('bili download: upstream', { host, status: upstream.status })
    if (!upstream.ok && upstream.status !== 206) {
      return fail(`源站返回 ${upstream.status}，请稍后重试或改用直链下载`, 502)
    }

    const base = (params.get('name') || 'bilibili-video')
      .replace(/\.mp4$/i, '')
      .replace(/[\r\n"\\]/g, '')
      .slice(0, 80)
    const headers = new Headers({ 'cache-control': 'no-store' })
    for (const key of PASS_HEADERS) {
      const value = upstream.headers.get(key)
      if (value) headers.set(key, value)
    }
    headers.set(
      'content-disposition',
      `attachment; filename="${asciiName(base)}.mp4"; filename*=UTF-8''${encodeURIComponent(base)}.mp4`,
    )

    return new Response(upstream.body, { status: upstream.status, headers })
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.error('bili download: failed', { message })
    return fail(`下载失败：${message}`, 502)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

    if (path === '/api/bili') return handleBili(request)
    if (path === '/api/bili-download') return handleDownload(request)
    if (path === '/api/social') return handleSocialResolve(request)
    if (path === '/api/social-download') return handleSocialDownload(request)
    if (path.startsWith('/api/')) return reply({ ok: false, message: '接口不存在' }, 404)

    return env.ASSETS.fetch(request)
  },
}
