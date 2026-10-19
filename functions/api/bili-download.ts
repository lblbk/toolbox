/**
 * 转发下载 B 站视频流：源站校验 Referer，浏览器直接打开直链会 403。
 * 只允许白名单里的 B 站域名，避免变成公开代理。
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const ALLOWED = ['bilivideo.com', 'bilivideo.cn', 'akamaized.net', 'bilibili.com']
const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag']

type Ctx = { request: Request }

function allowed(target: string) {
  try {
    const { protocol, hostname } = new URL(target)
    return (
      protocol === 'https:' &&
      ALLOWED.some((host) => hostname === host || hostname.endsWith(`.${host}`))
    )
  } catch {
    return false
  }
}

function asciiName(value: string) {
  return value.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'bilibili-video'
}

export const onRequestGet = async ({ request }: Ctx): Promise<Response> => {
  const fail = (message: string, status: number) =>
    new Response(JSON.stringify({ ok: false, message }), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })

  try {
    const params = new URL(request.url).searchParams
    const target = params.get('url') ?? ''
    if (!allowed(target)) return fail('地址不在允许范围内', 400)

    const range = request.headers.get('range')
    const upstream = await fetch(target, {
      headers: {
        'user-agent': UA,
        referer: 'https://www.bilibili.com/',
        origin: 'https://www.bilibili.com',
        ...(range ? { range } : {}),
      },
    })

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
    console.error('bili download failed:', message)
    return fail(`下载失败：${message}`, 502)
  }
}
