/**
 * 解析 B 站分享链接，返回标题、封面和可直接下载的视频地址。
 *
 * 浏览器的 fetch 既无法带 Referer，也跨不过 api.bilibili.com 的 CORS，
 * 所以用 Pages Function 转发一次，这也是所有纯前端解析方案都绕不开的一跳。
 * 视频取的是 platform=html5 的整段 mp4（音视频在一起），不挑清晰度。
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const BVID = /BV[0-9A-Za-z]{10}/
const SHORT_LINK = /https?:\/\/b23\.tv\/[0-9A-Za-z]+/

type Ctx = { request: Request }

type BiliData = {
  bvid?: string
  title?: string
  pic?: string
  duration?: number
  cid?: number
  owner?: { name?: string }
  pages?: { cid?: number }[]
  quality?: number
  durl?: { url?: string; size?: number; order?: number }[]
  support_formats?: { quality?: number; new_description?: string }[]
}

type BiliJson = { code?: number; message?: string; data?: BiliData }

/** 一次上游调用：data 为 null 表示返回的不是 JSON（风控页、空响应等） */
type Call = { status: number; data: BiliJson | null; snippet: string; type: string }

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

function api(path: string, cookie = '') {
  const headers: Record<string, string> = {
    'user-agent': UA,
    referer: 'https://www.bilibili.com/',
    origin: 'https://www.bilibili.com',
    accept: 'application/json, text/plain, */*',
  }
  if (cookie) headers.cookie = cookie
  return fetch(`https://api.bilibili.com${path}`, { headers })
}

async function call(path: string, cookie: string, trace: string[]): Promise<Call> {
  const label = `${cookie ? '带 cookie' : '不带 cookie'} ${path}`
  let response: Response
  try {
    response = await api(path, cookie)
  } catch (reason) {
    const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
    trace.push(`${label} -> 请求失败 ${message}`)
    throw new Error(`连接 B 站接口失败（${message}）`)
  }
  const body = await response.text()
  let data: BiliJson | null = null
  try {
    data = JSON.parse(body) as BiliJson
  } catch {
    data = null
  }
  const snippet = data ? '' : body.trim().slice(0, 200)
  trace.push(
    `${label} -> ${response.status} ${response.headers.get('content-type') ?? '无类型'} ${
      data ? `code ${data.code} ${data.message ?? ''}`.trim() : `非 JSON：${snippet || '空响应'}`
    }`,
  )
  return { status: response.status, data, snippet, type: response.headers.get('content-type') ?? '' }
}

function describe(result: Call, step: string) {
  const { data, status, snippet } = result
  if (data?.message) return `${step}失败：${data.message}（code ${data.code}）`
  if (snippet) return `${step}失败：B 站返回 ${status}，内容不是 JSON：${snippet}`
  return `${step}失败：B 站返回 ${status}`
}

/** 首页会下发 buvid3 等 cookie，接口风控拦截（-412）时用它重试 */
async function homeCookie() {
  try {
    const response = await fetch('https://www.bilibili.com/', { headers: { 'user-agent': UA } })
    const headers = response.headers as Headers & { getSetCookie?: () => string[] }
    return (headers.getSetCookie?.() ?? [])
      .map((value) => value.split(';')[0])
      .join('; ')
  } catch {
    return ''
  }
}

/** 首页也拿不到 cookie 时自己造一个 buvid3，风控接口带上它更容易放行 */
function fakeCookie() {
  return `buvid3=${crypto.randomUUID().toUpperCase()}infoc; b_nut=${Math.floor(Date.now() / 1000)}`
}

export const onRequestGet = async ({ request }: Ctx): Promise<Response> => {
  const trace: string[] = []
  let debug = false
  try {
    const params = new URL(request.url).searchParams
    debug = params.has('debug')
    const fail = (message: string, status: number) =>
      reply({ ok: false, message, ...(debug ? { trace } : {}) }, status)
    const raw = `${params.get('text') ?? ''} ${params.get('bvid') ?? ''}`.trim()
    if (!raw) return fail('没有收到链接', 400)

    let cookie = ''
    // 第一次不带 cookie，被风控拦下（-412 / 非 JSON）就带着首页 cookie 再来一次
    const load = async (path: string) => {
      let result = await call(path, '', trace)
      if (result.data?.code !== 0) {
        cookie ||= (await homeCookie()) || fakeCookie()
        result = await call(path, cookie, trace)
      }
      return result
    }

    let bvid = raw.match(BVID)?.[0]

    // b23.tv 短链要先跟着跳转，才能看到真实地址里的 BV 号
    if (!bvid) {
      const short = raw.match(SHORT_LINK)?.[0]
      if (!short) return fail('没找到 BV 号，请粘贴完整的分享链接', 400)
      const response = await fetch(short, { headers: { 'user-agent': UA }, redirect: 'follow' })
      bvid = response.url.match(BVID)?.[0] ?? (await response.text()).match(BVID)?.[0]
      if (!bvid) return fail('短链解析失败，请换成完整链接', 400)
    }

    const info = await load(`/x/web-interface/view?bvid=${bvid}`)
    if (info.data?.code !== 0 || !info.data.data) {
      if (info.data?.code === -404) return fail('视频不存在或已下架', 404)
      return fail(describe(info, '获取视频信息'), 502)
    }

    const detail = info.data.data
    const cid = detail.pages?.[0]?.cid ?? detail.cid
    if (!cid) return fail('没有拿到视频的分P信息', 502)

    const play = await load(
      `/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=1&fnver=0&fourk=0&platform=html5&high_quality=1`,
    )
    if (play.data?.code !== 0) {
      return fail(describe(play, '获取播放地址'), 502)
    }

    const playData = play.data.data
    const files = (playData?.durl ?? [])
      .map((part, index) => ({
        url: part.url ?? '',
        size: part.size ?? 0,
        order: part.order ?? index + 1,
      }))
      .filter((file) => file.url.startsWith('http'))

    if (files.length === 0) {
      return fail('这个视频没有可直接下载的地址，可能是番剧、付费或充电专属内容', 404)
    }

    const format = playData?.support_formats?.find((item) => item.quality === playData.quality)

    return reply({
      ok: true,
      bvid,
      title: detail.title ?? bvid,
      cover: detail.pic ?? '',
      up: detail.owner?.name ?? '',
      duration: detail.duration ?? 0,
      quality: format?.new_description ?? '',
      files,
    })
  } catch (reason) {
    const message =
      reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
    console.error('bili parse failed:', message)
    return reply({ ok: false, message: `解析失败：${message}`, ...(debug ? { trace } : {}) }, 502)
  }
}
