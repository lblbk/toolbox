# 工具箱

一个部署在 Cloudflare Pages 的在线小工具集合：首页是索引页，点击卡片后弹框直接使用。
除 B 站视频下载需要服务端转发一次请求外，其余工具都在浏览器本地完成计算，不保存输入内容。

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
| B 站视频下载 | 粘贴分享链接，拿到可直接下载的整段 MP4 地址（`/api/bili`） |

二维码在浏览器内绘制到 canvas，下载的 PNG / SVG 都不带任何水印，中文内容按 UTF-8 编码。

B 站视频下载通过 `functions/api/` 下的 Pages Function 转发：浏览器既无法设置 Referer，
也跨不过 `api.bilibili.com` 的 CORS，因此这一跳必须放在服务端。视频取的是整段 MP4
（音视频已合在一起），不挑清晰度；下载时同样由 Function 补上 Referer 再转发。

## 本地开发

```bash
npm install
npm run dev
```

`npm run dev` 是纯静态预览，B 站解析会提示找不到接口。要连接口一起跑：

```bash
npm run build
npx wrangler pages dev
```

## 部署

代码推到 GitHub `main` 分支，Cloudflare Pages 自动构建发布，线上地址 `https://tb.lblbk.top`。

| 配置项 | 值 |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |

`functions/` 会跟着同一次构建自动编译成 `/api/bili`、`/api/bili-download`，
和静态页面一起发布，不用单独建项目。项目使用 hash 路由（`#qr`、`#bilibili`），无需 SPA 回退规则。

部署后验证接口：

```bash
curl "https://tb.lblbk.top/api/bili?bvid=BV1P88w6xE2u"
```

返回带 `files` 的 JSON 就说明接口生效了。

## 目录结构

```
src/
  components/        卡片、弹框与通用控件
  hooks/             hash 路由（弹框与 URL 同步）
  tools/             每个工具一个文件，并在 index.ts 注册
  App.tsx            首页索引与搜索
functions/
  api/               Pages Functions（B 站解析与下载转发）
```

## 新增一个工具

1. 在 `src/tools/` 下新建组件文件，导出 `ToolDefinition`（`id` 同时作为 URL hash）。
2. 补上 `tags` 与 `theme`（图标底色、顶部色条、悬停染色、标签底色四组 Tailwind 类名），
   需要更宽的弹框时加 `wide: true`，核心工具可加 `featured: true` 使用深色主卡片。
3. 在 `src/tools/index.ts` 的 `tools` 数组中登记。

卡片、弹框、搜索关键词、深链接都会自动生效。
