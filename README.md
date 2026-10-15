# 工具箱

一个部署在 Cloudflare Pages 的在线小工具集合：首页是索引页，点击卡片后弹框直接使用。
所有计算都在浏览器本地完成，不发起任何网络请求，也不保存输入内容。

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

二维码在浏览器内绘制到 canvas，下载的 PNG / SVG 都不带任何水印，中文内容按 UTF-8 编码。

## 本地开发

```bash
npm install
npm run dev
```

构建与本地预览：

```bash
npm run build
npm run preview
```

## 部署到 Cloudflare Pages

### 方式一：连接 Git 仓库（推荐）

在 Cloudflare 控制台进入 **Workers & Pages → Create → Pages → Connect to Git**，选择仓库后填写：

| 配置项 | 值 |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |

之后每次推送到主分支都会自动构建发布。项目使用 hash 路由（`#qr`、`#json`），
无需配置 SPA 回退规则。

### 方式二：命令行直接上传

```bash
npm run build
npx wrangler pages deploy dist --project-name toolbox
```

首次执行会要求登录 Cloudflare 账号并创建项目。

## 目录结构

```
src/
  components/        卡片、弹框与通用控件
  hooks/             hash 路由（弹框与 URL 同步）
  tools/             每个工具一个文件，并在 index.ts 注册
  App.tsx            首页索引与搜索
```

## 新增一个工具

1. 在 `src/tools/` 下新建组件文件，导出 `ToolDefinition`（`id` 同时作为 URL hash）。
2. 补上 `tags` 与 `theme`（图标底色、顶部色条、悬停染色、标签底色四组 Tailwind 类名），
   需要更宽的弹框时加 `wide: true`，核心工具可加 `featured: true` 使用深色主卡片。
3. 在 `src/tools/index.ts` 的 `tools` 数组中登记。

卡片、弹框、搜索关键词、深链接都会自动生效。
