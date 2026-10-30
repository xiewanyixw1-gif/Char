# MORI 角色工作室

白灰韩系风格的 AI 角色卡与世界书工作台。可安装到手机主屏幕，并连接 OpenAI、Anthropic、Gemini 或兼容 OpenAI Chat Completions 的自定义 API。

## 功能

- 按 LiToT 字段整理基础信息、人设正文、开场白、人物小传和生图外貌
- 支持“从想法创作”与“从已有资料提取”两种完整角色卡生成模式
- 每个角色卡模块都能填写修改建议，让 AI 只重新优化指定部分
- 根据世界背景生成可编辑、可触发的世界书条目
- 本地自动保存草稿、API 预设和界面背景
- 导出完整角色卡 TXT / JSON 与世界书 JSON
- PWA 主屏幕安装和基础离线访问
- 移动端与桌面端自适应

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm test
```

## API 与隐私

API Key 只保存在使用者当前浏览器的 `localStorage`。生成时，密钥会随单次请求发送到本站的 `/api/generate` 代理，再转发到选定服务商；服务端不落库、不写日志。公开部署时建议仅在自己的设备上保存密钥。

自定义接口必须是可公开访问的 HTTPS 地址，并使用 OpenAI Chat Completions 兼容响应格式。服务端会拒绝 localhost 和常见私有网段，避免访问内部地址。

## 项目结构

- `app/page.tsx`：角色卡、世界书和 API 预设界面
- `app/api/generate/route.ts`：多服务商生成代理
- `public/manifest.webmanifest`：PWA 配置
- `public/sw.js`：离线缓存
- `.openai/hosting.json`：Sites 托管配置

## 说明

角色卡提取遵循“忠于原资料、不擅自补全、冲突单独列出”的原则。AI 生成结果仍建议在导出前逐项确认。
