# 工具箱

一个部署在 Cloudflare Workers 的在线小工具集合：首页是索引页，点击卡片后弹框直接使用。
常用工具在浏览器本地完成计算；B 站和小红书、X 媒体解析会按需请求 Worker，不保存输入内容。

## 技术栈

- React 19 + TypeScript + Vite
- Tailwind CSS v4（通过 `@tailwindcss/vite` 接入，无 PostCSS 配置）
- lucide-react 图标
- qrcode-generator（生成二维码，零依赖）

运行时依赖只有四个：`react`、`react-dom`、`lucide-react`、`qrcode-generator`。

## 已有工具

| 工具 | 说明 |
| --- | --- |
| 链接转二维码 | 链接或文本生成二维码，可下载 PNG / SVG，支持容错级别与自动补全协议头 |
| JSON 格式化 | 格式化、压缩、键排序、语法校验 |
| Base64 编解码 | 文本与 Base64 互转，支持 URL 安全变体 |
| 时间戳转换 | Unix 时间戳与本地时间、ISO 8601、UTC 互转 |
| B 站视频下载 | 粘贴分享链接，选择 360P / 480P / 720P / 1080P，拿到可直接下载的整段 MP4 地址（`/api/bili`） |
| 小红书 / X 媒体下载 | 粘贴小红书或 X / Twitter 分享文案，下载公开笔记、帖子的原图和视频（`/api/social`） |

二维码在浏览器内绘制到 canvas，下载的 PNG / SVG 都不带任何水印，中文内容按 UTF-8 编码。

B 站视频下载由 `worker/index.ts` 调用解析接口完成。解析时优先请求自建服务
`https://biliapi.lblbk.top/api/video`，失败后再依次尝试 `api.injahow.cn` 和
`bili.nekocha.top`；Worker 不会直连 `api.bilibili.com`。视频取整段 MP4
（音视频已合在一起），并按选择请求清晰度。自建服务返回代理链接时，Worker 会取出其中的
B 站 CDN 地址，补上 Referer 后转发下载。选择的是期望清晰度，实际结果取决于
源站账号和视频本身是否提供该档位；例如当前未登录态请求 1080P 时，可能实际
返回 720P。页面会显示解析服务实际返回的清晰度。最近 6 条解析记录只保存在
当前浏览器的 `localStorage` 中，不会上传到 Worker。

小红书解析会读取公开笔记页面的 `__INITIAL_STATE__` 数据，提取原图和视频直链；
短链会先跟随跳转解析。X / Twitter 会优先使用公开的 fxtwitter / vxtwitter JSON
接口，失败后自动切换备用线路。媒体下载经过 `/api/social-download` 转发，并限制
只访问小红书、X 的图片和视频 CDN 域名。小红书图片会保留原图、华为和百度 CDN
等多个候选地址，主地址失效时自动尝试备用地址。最近 5 条小红书 / X 解析记录同样
只保存在当前浏览器。

这类第三方公开页面解析受源站登录、风控和页面结构变化影响，私密、删除、登录可见
的内容不会尝试绕过限制；如果小红书返回人机验证，接口会明确提示而不是返回一段
HTML 页面。实现思路参考了
[`icekale/rednote-downloader`](https://github.com/icekale/rednote-downloader)
的小红书公开页面解析方式；该仓库的抖音流程依赖 Node 签名和额外下载服务，因此没有
直接并入当前 Cloudflare Worker。需要在本地调试完整链路时使用 `npx wrangler dev`。

## 本地开发

```bash
npm install
npm run dev
```

`npm run dev` 是纯静态预览，B 站和小红书 / X 解析会提示找不到接口。要连 Worker 接口一起跑：

```bash
npm run build
npx wrangler dev
```

## 部署

代码推到 GitHub `main` 分支，Cloudflare Workers 自动构建发布。默认地址为
`https://toolbox.lblbk.workers.dev`，也可以绑定自己的域名。

在 Cloudflare 控制台进入 **Workers & Pages → Create → Workers → Connect to Git**，选择
`lblbk/toolbox`，然后填写：

| 配置项 | 值 |
| --- | --- |
| Worker name | `toolbox` |
| Branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

`wrangler.toml` 会把 `dist/` 作为静态资源发布，同时把 `/api/*` 交给 `worker/index.ts`。
项目使用 hash 路由（`#qr`、`#bilibili`），静态资源不需要额外的 SPA 回退规则。

如果需要自定义域名，在 **Settings → Domains & Routes** 中添加 Custom Domain。

Worker 日志默认开启，可在 **Workers & Pages → toolbox → Logs** 中按时间查询，
也可以在本地执行：

```bash
npx wrangler tail
```

部署后验证接口：

```bash
curl "https://toolbox.lblbk.workers.dev/api/bili?bvid=BV1P88w6xE2u"
curl "https://toolbox.lblbk.workers.dev/api/social?text=https://xhslink.com/..."
```

返回带 `files` 的 JSON 就说明 Worker 和接口都已生效。

## 目录结构

```
src/
  components/        卡片、弹框与通用控件
  hooks/             hash 路由（弹框与 URL 同步）
  tools/             每个工具一个文件，并在 index.ts 注册
  App.tsx            首页索引与搜索
worker/
  index.ts           Worker 入口（静态资源、B 站与社交媒体接口）
  social.ts          小红书 / X 页面和媒体解析
```

## 新增一个工具

1. 在 `src/tools/` 下新建组件文件，导出 `ToolDefinition`（`id` 同时作为 URL hash）。
2. 补上 `tags` 与 `theme`（图标底色、顶部色条、悬停染色、标签底色四组 Tailwind 类名），
   需要更宽的弹框时加 `wide: true`，核心工具可加 `featured: true` 使用深色主卡片。
3. 在 `src/tools/index.ts` 的 `tools` 数组中登记。

卡片、弹框、搜索关键词、深链接都会自动生效。

## 媒体接口

- `GET /api/bili?text=分享文案&qn=64`：解析 B 站视频，`qn` 可选 `16`、`32`、`64`、`80`。
- `GET /api/bili-download?url=...`：转发 B 站 CDN 视频。
- `GET /api/social?text=分享文案`：解析小红书或 X / Twitter 媒体。
- `GET /api/social-download?url=...&type=video`：转发图片或视频；加上 `inline=1` 用于页面内预览。

解析请求带上 `debug=1` 时，响应会附带 `trace` 字段，方便在 Cloudflare Worker
日志里定位是哪一条上游线路失败。
