const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const XHS_SHARE_HOSTS = ['xhslink.com', 'xhslink.cn', 'xiaohongshu.com']
const X_SHARE_HOSTS = ['x.com', 'twitter.com']
const XHS_MEDIA_HOSTS = ['xhscdn.com', 'xiaohongshu.com']
const X_MEDIA_HOSTS = ['twimg.com']
const XHS_LOGIN_RE =
  /登录后查看|请先登录|登录后继续|扫码登录|login|sign in/i
const X_API_BASES = ['https://api.fxtwitter.com', 'https://api.vxtwitter.com']
const PASS_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
]
const REQUEST_TIMEOUT = 20_000
const MEDIA_TIMEOUT = 30_000
const MAX_REDIRECTS = 8

type JsonObject = Record<string, unknown>
type Platform = 'rednote' | 'x'
type MediaType = 'image' | 'video'

type SocialMedia = {
  type: MediaType
  url: string
  fallbackUrls: string[]
}

type SocialResult = {
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

class SocialRequestError extends Error {
  status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'SocialRequestError'
    this.status = status
  }
}

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

const textValue = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const nestedObject = (value: unknown, ...keys: string[]): JsonObject | null => {
  let current = value
  for (const key of keys) {
    if (!isObject(current)) return null
    current = current[key]
  }
  return isObject(current) ? current : null
}

const messageOf = (reason: unknown) =>
  reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)

function hostMatches(hostname: string, domains: string[]) {
  return domains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  )
}

function normalizedShareUrl(raw: string) {
  const match = raw.match(/https?:\/\/[^\s<>"']+/i)
  if (!match) throw new SocialRequestError('没有找到链接，请粘贴完整分享文案', 400)

  const cleaned = match[0].replace(/[)\]}>，。；！？、,.;!?】」』]+$/u, '')
  let url: URL
  try {
    url = new URL(cleaned)
  } catch {
    throw new SocialRequestError('链接格式不正确', 400)
  }

  if (url.username || url.password) {
    throw new SocialRequestError('链接不能包含用户名或密码', 400)
  }

  if (url.protocol === 'http:') url.protocol = 'https:'
  if (url.protocol !== 'https:') {
    throw new SocialRequestError('只支持 HTTPS 链接', 400)
  }

  if (!hostMatches(url.hostname, [...XHS_SHARE_HOSTS, ...X_SHARE_HOSTS])) {
    throw new SocialRequestError('目前只支持小红书和 X / Twitter 链接', 400)
  }

  return url
}

function normalizedXhsUrl(value: string, base?: string) {
  let url: URL
  try {
    url = base ? new URL(value, base) : new URL(value)
  } catch {
    throw new SocialRequestError('小红书跳转地址格式不正确')
  }

  if (url.username || url.password) {
    throw new SocialRequestError('小红书跳转地址不安全')
  }
  if (url.protocol === 'http:') url.protocol = 'https:'
  if (url.protocol !== 'https:' || !hostMatches(url.hostname, XHS_SHARE_HOSTS)) {
    throw new SocialRequestError(`小红书跳转到了不允许的地址：${url.hostname}`)
  }
  return url
}

function normalizedMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol === 'http:') url.protocol = 'https:'
    if (url.protocol !== 'https:' || url.username || url.password) return null
    if (
      !hostMatches(url.hostname, XHS_MEDIA_HOSTS) &&
      !hostMatches(url.hostname, X_MEDIA_HOSTS)
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (reason) {
    if (reason instanceof Error && reason.name === 'AbortError') {
      throw new SocialRequestError('上游请求超时，请稍后重试', 504)
    }
    throw reason
  } finally {
    clearTimeout(timeout)
  }
}

function htmlRedirect(html: string, currentUrl: string) {
  const patterns = [
    /window\.location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i,
    /window\.location\.replace\(\s*['"]([^'"]+)['"]\s*\)/i,
    /content=['"][^'"]*url=([^'";]+)['"]/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (!match?.[1]) continue
    return normalizedXhsUrl(match[1].replace(/&amp;/g, '&'), currentUrl)
  }
  return null
}

function isXhsLoginPage(url: URL, html: string) {
  if (url.hostname.endsWith('xiaohongshu.com') && url.pathname === '/login') {
    return true
  }

  return (
    !html.includes('window.__INITIAL_STATE__') &&
    XHS_LOGIN_RE.test(html)
  )
}

async function fetchXhsPageWithUa(
  initial: URL,
  userAgent: string,
  requestId: string,
  trace: string[],
) {
  let current = normalizedXhsUrl(initial.toString())
  const visited = new Set<string>()

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    const key = current.toString()
    if (visited.has(key)) throw new SocialRequestError('小红书短链出现了循环跳转')
    visited.add(key)

    const started = Date.now()
    const response = await fetchWithTimeout(current, {
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
        referer: 'https://www.xiaohongshu.com/',
        'user-agent': userAgent,
      },
      redirect: 'manual',
    })

    trace.push(
      `xiaohongshu hop ${hop + 1} -> HTTP ${response.status} ${current.hostname} (${Date.now() - started}ms)`,
    )
    console.log('social rednote: fetch hop', {
      requestId,
      hop: hop + 1,
      host: current.hostname,
      status: response.status,
      elapsedMs: Date.now() - started,
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new SocialRequestError('小红书跳转响应缺少 Location')
      current = normalizedXhsUrl(location, current.toString())
      continue
    }

    if (!response.ok) {
      throw new SocialRequestError(`小红书页面返回 ${response.status}`, 502)
    }

    const html = await response.text()
    const next = htmlRedirect(html, current.toString())
    if (next && next.toString() !== current.toString()) {
      current = next
      continue
    }

    if (
      !html.includes('window.__INITIAL_STATE__') &&
      /captcha|访问受限|安全验证|验证码/i.test(html)
    ) {
      throw new SocialRequestError('小红书触发了人机验证，请稍后重试', 429)
    }

    return { url: current, html }
  }

  throw new SocialRequestError('小红书短链跳转次数过多')
}

async function fetchXhsPage(
  initial: URL,
  requestId: string,
  trace: string[],
) {
  const desktop = await fetchXhsPageWithUa(initial, DESKTOP_UA, requestId, trace)
  if (!isXhsLoginPage(desktop.url, desktop.html)) return desktop

  trace.push('xiaohongshu desktop -> login page, retry anonymous mobile page')
  console.log('social rednote: retry mobile page', { requestId })
  const mobile = await fetchXhsPageWithUa(initial, MOBILE_UA, requestId, trace)
  if (isXhsLoginPage(mobile.url, mobile.html)) {
    throw new SocialRequestError(
      '小红书要求登录后才能查看这条笔记，请稍后重试公开笔记',
      422,
    )
  }
  return mobile
}

function objectEnd(source: string, start: number) {
  let depth = 0
  let quote = ''
  let escaped = false

  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function replaceNonJsonTokens(source: string) {
  let output = ''
  let quote = ''
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      output += char
      continue
    }

    if (/[A-Za-z_$]/.test(char)) {
      let token = char
      let cursor = index + 1
      while (cursor < source.length && /[\w$]/.test(source[cursor])) {
        token += source[cursor]
        cursor += 1
      }
      output += token === 'undefined' || token === 'NaN' || token === 'Infinity'
        ? 'null'
        : token
      index = cursor - 1
      continue
    }

    output += char
  }

  return output
}

function extractInitialState(html: string): JsonObject {
  const marker = 'window.__INITIAL_STATE__'
  const markerIndex = html.indexOf(marker)
  if (markerIndex < 0) {
    throw new SocialRequestError(
      '页面中没有找到小红书数据，可能是私密、已删除或触发了风控',
      422,
    )
  }

  const objectStart = html.indexOf('{', markerIndex + marker.length)
  if (objectStart < 0) throw new SocialRequestError('小红书页面数据结构不完整')
  const end = objectEnd(html, objectStart)
  if (end < 0) throw new SocialRequestError('小红书页面数据不完整')

  try {
    const parsed: unknown = JSON.parse(
      replaceNonJsonTokens(html.slice(objectStart, end + 1)),
    )
    if (!isObject(parsed)) throw new Error('state is not an object')
    return parsed
  } catch (reason) {
    throw new SocialRequestError(`小红书页面数据解析失败：${messageOf(reason)}`, 422)
  }
}

function noteIdFromUrl(url: URL) {
  return url.pathname.match(/\/(?:explore|discovery\/item)\/([^/?]+)/)?.[1] ?? ''
}

function findNoteData(state: JsonObject, noteId: string) {
  const legacy = nestedObject(state, 'noteData', 'data', 'noteData')
  if (legacy) return legacy

  const detailMap =
    nestedObject(state, 'note', 'noteDetailMap') ??
    nestedObject(state, 'note', 'detailMap')
  if (!detailMap) return null

  const selected = noteId ? detailMap[noteId] : null
  if (isObject(selected)) {
    const note = selected.note
    return isObject(note) ? note : selected
  }

  for (const value of Object.values(detailMap)) {
    if (!isObject(value)) continue
    const note = value.note
    return isObject(note) ? note : value
  }
  return null
}

function htmlTitle(html: string) {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/is)
  if (!match?.[1]) return ''
  return match[1]
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s*-\s*小红书\s*$/u, '')
    .trim()
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function imageOrigin(value: string) {
  const match = value.match(
    /^https?:\/\/sns-webpic[^/]*\.xhscdn\.com\/[^/]+\/[^/]+\/([^!?]+)(?:[!?].*)?$/i,
  )
  return match?.[1] ? `https://ci.xiaohongshu.com/${match[1]}` : null
}

function imageCdnFallbacks(value: string) {
  const match = value.match(
    /^https?:\/\/sns-webpic[^/]*\.xhscdn\.com\/[^/]+\/[^/]+\/([^!?]+)(?:[!?].*)?$/i,
  )
  const key = match?.[1]
  if (!key) return []
  return [
    `https://sns-img-hw.xhscdn.com/${key}?imageView2/2/w/format/png`,
    `https://sns-img-bd.xhscdn.com/${key}?imageView2/2/w/format/png`,
  ]
}

function imageScore(value: string) {
  const lower = value.toLowerCase()
  let score = 0
  if (lower.includes('ci.xiaohongshu.com')) score += 100
  if (lower.includes('original') || lower.includes('origin')) score += 40
  if (lower.includes('dft')) score += 15
  if (lower.includes('wm')) score -= 200
  if (lower.includes('preview') || lower.includes('prv')) score -= 30
  return score
}

function imageCandidates(image: JsonObject) {
  const raw: unknown[] = [
    image.urlDefault,
    image.url,
    image.urlPre,
    image.traceId,
  ]

  for (const key of ['infoList', 'urlInfoList']) {
    const list = image[key]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (isObject(item)) raw.push(item.url, item.urlDefault)
    }
  }

  const normalized = uniqueStrings(raw.map(normalizedMediaUrl))
  const derived = uniqueStrings(normalized.map(imageOrigin).map(normalizedMediaUrl))
  const cdn = uniqueStrings(
    normalized.flatMap(imageCdnFallbacks).map(normalizedMediaUrl),
  )

  return uniqueStrings([...derived, ...cdn, ...normalized]).sort(
    (left, right) => imageScore(right) - imageScore(left),
  )
}

function extractImages(note: JsonObject) {
  const images = Array.isArray(note.imageList) ? note.imageList : []
  return images.flatMap((item): SocialMedia[] => {
    if (!isObject(item)) return []
    const candidates = imageCandidates(item)
    const [url, ...fallbackUrls] = candidates
    return url ? [{ type: 'image', url, fallbackUrls }] : []
  })
}

function videoCandidates(note: JsonObject) {
  const originKey = textValue(
    nestedObject(note, 'video', 'consumer')?.originVideoKey,
  )
  const stream = nestedObject(note, 'video', 'media', 'stream')
  const raw: unknown[] = []

  if (originKey) raw.push(`https://sns-video-bd.xhscdn.com/${originKey}`)

  for (const codec of ['h264', 'h265']) {
    const list = stream?.[codec]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!isObject(item)) continue
      raw.push(item.masterUrl, item.backupUrl, item.url)
      if (Array.isArray(item.backupUrls)) {
        raw.push(...item.backupUrls)
      }
    }
  }

  const normalized = uniqueStrings(raw.map(normalizedMediaUrl))
  const direct = normalized.filter((url) => !/\.m3u8(?:$|\?)/i.test(url))
  return (direct.length > 0 ? direct : normalized).sort((left, right) => {
    const leftScore =
      (/\.mp4(?:$|\?)/i.test(left) ? 10 : 0) +
      (left.includes('sns-video-bd') ? 5 : 0) +
      (left.includes('h264') ? 2 : 0)
    const rightScore =
      (/\.mp4(?:$|\?)/i.test(right) ? 10 : 0) +
      (right.includes('sns-video-bd') ? 5 : 0) +
      (right.includes('h264') ? 2 : 0)
    return rightScore - leftScore
  })
}

function parseRednotePage(
  html: string,
  pageUrl: URL,
): SocialResult {
  const state = extractInitialState(html)
  const noteId = noteIdFromUrl(pageUrl)
  const note = findNoteData(state, noteId)
  if (!note) {
    throw new SocialRequestError(
      '没有找到笔记内容，可能是私密、已删除、登录可见或触发了风控',
      422,
    )
  }

  const images = extractImages(note)
  const videos = videoCandidates(note)
  const [videoUrl, ...videoFallbacks] = videos
  const video: SocialMedia | null = videoUrl
    ? { type: 'video', url: videoUrl, fallbackUrls: videoFallbacks }
    : null
  const media: SocialMedia[] = images.length > 1
    ? [...images, ...(video ? [video] : [])]
    : video
      ? [video]
      : images
  if (media.length === 0) {
    throw new SocialRequestError('这条笔记没有可下载的图片或视频', 422)
  }

  const description = textValue(note.desc)
  const title =
    textValue(note.title) ||
    htmlTitle(html) ||
    description.slice(0, 48) ||
    `小红书笔记 ${noteId || ''}`.trim()
  const author =
    textValue(nestedObject(note, 'user')?.nickname) ||
    textValue(nestedObject(note, 'author')?.nickname)
  const firstFrame = normalizedMediaUrl(
    nestedObject(note, 'video', 'image')?.firstFrame,
  )
  const warnings = media.some(
    (item) => item.type === 'video' && /\.m3u8(?:$|\?)/i.test(item.url),
  )
    ? ['该笔记只提供了 HLS 播放列表，可能无法作为单个视频文件下载。']
    : []

  return {
    platform: 'rednote',
    id: textValue(note.noteId) || noteId,
    title,
    description,
    author,
    cover: images[0]?.url || firstFrame || '',
    sourceUrl: pageUrl.toString(),
    media,
    warnings,
  }
}

function xStatus(url: URL) {
  const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/i)
  if (!match?.[1] || !match[2]) {
    throw new SocialRequestError('没有找到 X 帖子 ID', 400)
  }
  return {
    screenName: match[1].toLowerCase() === 'i' ? '' : match[1],
    id: match[2],
  }
}

function xApiUrl(base: string, screenName: string, id: string) {
  const root = base.replace(/\/+$/, '')
  return screenName
    ? `${root}/${encodeURIComponent(screenName)}/status/${id}`
    : `${root}/status/${id}`
}

async function fetchXPayload(
  status: { screenName: string; id: string },
  requestId: string,
  trace: string[],
) {
  const errors: string[] = []

  for (const base of X_API_BASES) {
    const apiUrl = xApiUrl(base, status.screenName, status.id)
    const started = Date.now()
    try {
      const response = await fetchWithTimeout(apiUrl, {
        headers: {
          accept: 'application/json',
          'user-agent': DESKTOP_UA,
        },
      })
      const body = await response.text()
      let payload: unknown = null
      try {
        payload = JSON.parse(body)
      } catch {
        payload = null
      }

      trace.push(
        `${new URL(base).hostname} -> HTTP ${response.status} ${payload ? 'JSON' : '非 JSON'} (${Date.now() - started}ms)`,
      )
      console.log('social x: upstream', {
        requestId,
        source: new URL(base).hostname,
        status: response.status,
        json: Boolean(payload),
        elapsedMs: Date.now() - started,
      })

      const validPayload =
        response.ok &&
        isObject(payload) &&
        (Number(payload.code) === 200 ||
          isObject(payload.tweet) ||
          typeof payload.tweetID === 'string')
      if (validPayload && isObject(payload)) return payload

      const upstreamMessage =
        isObject(payload) && typeof payload.message === 'string'
          ? payload.message
          : `HTTP ${response.status}`
      errors.push(`${new URL(base).hostname}: ${upstreamMessage}`)
    } catch (reason) {
      const message = messageOf(reason)
      errors.push(`${new URL(base).hostname}: ${message}`)
      trace.push(`${new URL(base).hostname} -> ${message}`)
    }
  }

  throw new SocialRequestError(
    `X 解析服务暂时不可用${errors[0] ? `（${errors[0]}）` : ''}`,
  )
}

function normalizeXPhoto(value: unknown) {
  const url = normalizedMediaUrl(value)
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (
      parsed.hostname.endsWith('.twimg.com') &&
      (parsed.pathname.includes('/media/') || parsed.searchParams.has('format'))
    ) {
      parsed.searchParams.set('name', 'orig')
      return parsed.toString()
    }
  } catch {
    return null
  }
  return url
}

function pickXVideos(item: JsonObject) {
  const variants = Array.isArray(item.formats)
    ? item.formats
    : Array.isArray(item.variants)
      ? item.variants
      : []

  const candidates = variants
    .flatMap((variant): { url: string; bitrate: number }[] => {
      if (!isObject(variant)) return []
      const url = normalizedMediaUrl(variant.url)
      if (!url) return []
      const container = textValue(variant.container).toLowerCase()
      const contentType = textValue(variant.content_type).toLowerCase()
      const isMp4 =
        container === 'mp4' ||
        contentType.includes('mp4') ||
        /\.mp4(?:$|\?)/i.test(url)
      if (!isMp4) return []
      return [{ url, bitrate: Number(variant.bitrate) || 0 }]
    })
    .sort((left, right) => right.bitrate - left.bitrate)

  const fallback = normalizedMediaUrl(item.url)
  return uniqueStrings([
    ...candidates.map((candidate) => candidate.url),
    ...(fallback ? [fallback] : []),
  ])
}

function xMediaItems(payload: JsonObject) {
  const tweet = isObject(payload.tweet) ? payload.tweet : payload
  const media = isObject(tweet.media) ? tweet.media : null
  const all = Array.isArray(media?.all)
    ? media.all
    : Array.isArray(tweet.media_extended)
      ? tweet.media_extended
      : []

  return all.flatMap((item): SocialMedia[] => {
    if (!isObject(item)) return []
    const type = textValue(item.type).toLowerCase()
    if (type === 'photo' || type === 'image') {
      const url = normalizeXPhoto(item.url)
      return url ? [{ type: 'image', url, fallbackUrls: [] }] : []
    }
    if (type === 'video' || type === 'gif') {
      const [url, ...fallbackUrls] = pickXVideos(item)
      return url ? [{ type: 'video', url, fallbackUrls }] : []
    }
    return []
  })
}

function parseXPayload(
  payload: JsonObject,
  sourceUrl: URL,
  fallbackId: string,
): SocialResult {
  const tweet = isObject(payload.tweet) ? payload.tweet : payload
  const media = xMediaItems(payload)
  if (media.length === 0) {
    throw new SocialRequestError('这条 X 帖子里没有可下载的图片或视频', 422)
  }

  const author = isObject(tweet.author) ? tweet.author : null
  const authorName = textValue(author?.name) || textValue(tweet.user_name)
  const screenName =
    textValue(author?.screen_name) || textValue(tweet.user_screen_name)
  const description = textValue(tweet.text) || textValue(tweet.description)
  const title = authorName
    ? `${authorName}${screenName ? ` (@${screenName})` : ''}`
    : screenName
      ? `@${screenName}`
      : 'X 帖子'
  const tweetMedia = isObject(tweet.media) ? tweet.media : null
  const allMedia = Array.isArray(tweetMedia?.all)
    ? tweetMedia.all
    : Array.isArray(tweet.media_extended)
      ? tweet.media_extended
      : []
  const videoThumbnail = allMedia
    .flatMap((item): string[] => {
      if (!isObject(item)) return []
      const thumbnail = normalizedMediaUrl(
        item.thumbnail_url ?? item.thumbnailUrl ?? item.thumbnail,
      )
      return thumbnail ? [thumbnail] : []
    })
    .at(0)
  const cover =
    media.find((item) => item.type === 'image')?.url || videoThumbnail || ''

  return {
    platform: 'x',
    id: textValue(tweet.id) || textValue(tweet.tweetID) || fallbackId,
    title,
    description,
    author: authorName || screenName,
    cover,
    sourceUrl: sourceUrl.toString(),
    media,
    warnings: [],
  }
}

async function resolveRednote(
  url: URL,
  requestId: string,
  trace: string[],
): Promise<SocialResult> {
  const page = await fetchXhsPage(url, requestId, trace)
  return parseRednotePage(page.html, page.url)
}

async function resolveX(
  url: URL,
  requestId: string,
  trace: string[],
): Promise<SocialResult> {
  const status = xStatus(url)
  const payload = await fetchXPayload(status, requestId, trace)
  return parseXPayload(payload, url, status.id)
}

export async function handleSocialResolve(request: Request): Promise<Response> {
  const started = Date.now()
  const requestId = request.headers.get('cf-ray') || crypto.randomUUID()
  const params = new URL(request.url).searchParams
  const debug = params.has('debug')
  const trace: string[] = []

  console.log('social resolve: request', {
    requestId,
    debug,
    hasText: params.has('text'),
  })

  const fail = (message: string, status: number) => {
    const details = { requestId, status, message, trace, elapsedMs: Date.now() - started }
    if (status >= 500) console.error('social resolve: response', details)
    else console.log('social resolve: response', details)
    return reply(
      { ok: false, requestId, message, ...(debug ? { trace } : {}) },
      status,
      requestId,
    )
  }

  if (request.method !== 'GET') return fail('只支持 GET 请求', 405)

  try {
    const input = params.get('text') ?? ''
    if (!input.trim()) return fail('没有收到分享链接', 400)
    if (input.length > 4_000) return fail('分享文案过长', 413)

    const url = normalizedShareUrl(input)
    const result = hostMatches(url.hostname, XHS_SHARE_HOSTS)
      ? await resolveRednote(url, requestId, trace)
      : await resolveX(url, requestId, trace)

    console.log('social resolve: success', {
      requestId,
      platform: result.platform,
      id: result.id,
      mediaCount: result.media.length,
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
  } catch (reason) {
    const status = reason instanceof SocialRequestError ? reason.status : 502
    const message = reason instanceof SocialRequestError
      ? reason.message
      : `解析失败：${messageOf(reason)}`
    return fail(message, status)
  }
}

function allowedMediaUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (hostMatches(url.hostname, XHS_MEDIA_HOSTS) ||
        hostMatches(url.hostname, X_MEDIA_HOSTS))
    )
  } catch {
    return false
  }
}

function mediaHeaders(target: URL) {
  const isX = hostMatches(target.hostname, X_MEDIA_HOSTS)
  return {
    accept: '*/*',
    referer: isX ? 'https://x.com/' : 'https://www.xiaohongshu.com/',
    origin: isX ? 'https://x.com' : 'https://www.xiaohongshu.com',
    'user-agent': DESKTOP_UA,
  }
}

async function fetchMediaCandidate(target: string, range: string | null) {
  let current = new URL(target)

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    if (!allowedMediaUrl(current.toString())) {
      throw new SocialRequestError(`媒体地址不在允许范围内：${current.hostname}`, 400)
    }

    const response = await fetchWithTimeout(
      current,
      {
        headers: {
          ...mediaHeaders(current),
          ...(range ? { range } : {}),
        },
        redirect: 'manual',
      },
      MEDIA_TIMEOUT,
    )

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new SocialRequestError('媒体跳转响应缺少 Location')
      current = new URL(location, current)
      continue
    }

    return { response, url: current }
  }

  throw new SocialRequestError('媒体地址跳转次数过多')
}

async function fetchMedia(
  targets: string[],
  range: string | null,
) {
  const errors: string[] = []

  for (const target of uniqueStrings(targets).slice(0, 5)) {
    try {
      const result = await fetchMediaCandidate(target, range)
      if (
        (result.response.ok || result.response.status === 206) &&
        result.response.body
      ) {
        return result
      }
      errors.push(`${result.url.hostname}: HTTP ${result.response.status}`)
    } catch (reason) {
      errors.push(`${new URL(target).hostname}: ${messageOf(reason)}`)
    }
  }

  throw new SocialRequestError(
    `媒体源站暂时不可用${errors[0] ? `（${errors[0]}）` : ''}`,
    502,
  )
}

function safeStem(value: string) {
  return (
    value
      .replace(/\.(?:jpe?g|png|webp|heic|gif|mp4|mov|m3u8)$/i, '')
      .replace(/[\r\n"\\/:*?<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'social-media'
  )
}

function extensionFor(
  requested: string | null,
  contentType: string,
  pathname: string,
  fallback: string,
) {
  const normalizedRequested = requested?.replace(/^\./, '').toLowerCase() ?? ''
  if (/^(?:jpe?g|png|webp|heic|gif|mp4|mov)$/.test(normalizedRequested)) {
    return normalizedRequested === 'jpeg' ? 'jpg' : normalizedRequested
  }

  const type = contentType.toLowerCase()
  if (type.includes('image/jpeg')) return 'jpg'
  if (type.includes('image/png')) return 'png'
  if (type.includes('image/webp')) return 'webp'
  if (type.includes('image/heic')) return 'heic'
  if (type.includes('image/gif')) return 'gif'
  if (type.includes('video/mp4')) return 'mp4'
  if (type.includes('video/quicktime')) return 'mov'

  const fromPath = pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()
  return fromPath || fallback
}

export async function handleSocialDownload(request: Request): Promise<Response> {
  const requestId = request.headers.get('cf-ray') || crypto.randomUUID()
  const fail = (message: string, status: number) =>
    reply({ ok: false, requestId, message }, status, requestId)

  if (request.method !== 'GET') return fail('只支持 GET 请求', 405)

  try {
    const params = new URL(request.url).searchParams
    const target = params.get('url') ?? ''
    if (!target || target.length > 8_192 || !allowedMediaUrl(target)) {
      return fail('地址不在允许范围内', 400)
    }
    const fallbacks = uniqueStrings(params.getAll('fallback'))
    if (
      fallbacks.length > 4 ||
      fallbacks.some((value) => value.length > 8_192 || !allowedMediaUrl(value))
    ) {
      return fail('备用地址不在允许范围内', 400)
    }

    const type = params.get('type') === 'video' ? 'video' : 'image'
    const inline = params.has('inline')
    const range = request.headers.get('range')
    const started = Date.now()
    const { response: upstream, url } = await fetchMedia([target, ...fallbacks], range)

    console.log('social download: upstream', {
      requestId,
      host: url.hostname,
      status: upstream.status,
      range: range ?? 'full',
      elapsedMs: Date.now() - started,
    })

    const contentType = upstream.headers.get('content-type') ?? ''
    const extension = extensionFor(
      params.get('ext'),
      contentType,
      url.pathname,
      type === 'video' ? 'mp4' : 'jpg',
    )
    const stem = safeStem(params.get('name') ?? 'social-media')
    const asciiStem = stem.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'social-media'
    const headers = new Headers({
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    })

    for (const key of PASS_HEADERS) {
      const value = upstream.headers.get(key)
      if (value) headers.set(key, value)
    }
    if (!headers.has('content-type')) {
      headers.set(
        'content-type',
        type === 'video' ? 'video/mp4' : 'application/octet-stream',
      )
    }
    if (!inline) {
      headers.set(
        'content-disposition',
        `attachment; filename="${asciiStem}.${extension}"; filename*=UTF-8''${encodeURIComponent(stem)}.${extension}`,
      )
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch (reason) {
    const status = reason instanceof SocialRequestError ? reason.status : 502
    const message = reason instanceof SocialRequestError
      ? reason.message
      : `下载失败：${messageOf(reason)}`
    console.error('social download: failed', {
      requestId,
      status,
      message,
    })
    return fail(message, status)
  }
}
