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
  }
  if (cookie) headers.cookie = cookie
  return fetch(`https://api.bilibili.com${path}`, { headers })
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

export const onRequestGet = async ({ request }: Ctx): Promise<Response> => {
  const params = new URL(request.url).searchParams
  const raw = `${params.get('text') ?? ''} ${params.get('bvid') ?? ''}`.trim()
  if (!raw) return reply({ ok: false, message: '没有收到链接' }, 400)

  let cookie = ''
  const load = async (path: string) => {
    let data = (await (await api(path)).json()) as BiliJson
    if (data.code === -412 || data.code === -403) {
      cookie ||= await homeCookie()
      data = (await (await api(path, cookie)).json()) as BiliJson
    }
    return data
  }

  let bvid = raw.match(BVID)?.[0]

  // b23.tv 短链要先跟着跳转，才能看到真实地址里的 BV 号
  if (!bvid) {
    const short = raw.match(SHORT_LINK)?.[0]
    if (!short) return reply({ ok: false, message: '没找到 BV 号，请粘贴完整的分享链接' }, 400)
    const response = await fetch(short, { headers: { 'user-agent': UA }, redirect: 'follow' })
    bvid = response.url.match(BVID)?.[0] ?? (await response.text()).match(BVID)?.[0]
    if (!bvid) return reply({ ok: false, message: '短链解析失败，请换成完整链接' }, 400)
  }

  const info = await load(`/x/web-interface/view?bvid=${bvid}`)
  if (info.code !== 0 || !info.data) {
    return reply({ ok: false, message: info.message || '视频不存在或已下架' }, 404)
  }

  const cid = info.data.pages?.[0]?.cid ?? info.data.cid
  if (!cid) return reply({ ok: false, message: '没有拿到视频的分P信息' }, 502)

  const play = await load(
    `/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=1&fnver=0&fourk=0&platform=html5&high_quality=1`,
  )
  const files = (play.data?.durl ?? [])
    .map((part, index) => ({
      url: part.url ?? '',
      size: part.size ?? 0,
      order: part.order ?? index + 1,
    }))
    .filter((file) => file.url.startsWith('http'))

  if (files.length === 0) {
    return reply({ ok: false, message: '这个视频没有可直接下载的地址，可能是番剧、付费或充电专属内容' }, 404)
  }

  const format = play.data?.support_formats?.find((item) => item.quality === play.data?.quality)

  return reply({
    ok: true,
    bvid,
    title: info.data.title ?? bvid,
    cover: info.data.pic ?? '',
    up: info.data.owner?.name ?? '',
    duration: info.data.duration ?? 0,
    quality: format?.new_description ?? '',
    files,
  })
}
