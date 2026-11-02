# Char 角色工作室

白灰韩系风格的 AI 角色卡与世界书工作台。可安装到手机主屏幕，并连接 OpenAI、Anthropic、Gemini 或兼容 OpenAI Chat Completions 的自定义 API。

## 功能

- 按 LiToT 字段整理基础信息、人设正文、不限数量的开场白、人物小传和生图外貌
- 支持“从想法创作”与“从已有资料提取”两种完整角色卡生成模式
- 支持多个独立角色档案，新建、复制、切换、删除与完整备份恢复
- 每个角色卡模块都能填写修改建议，AI 新版本会先与原文对比，确认后再应用并支持撤销
- 开场白不限数量，支持拖拽/按钮排序、复制和单条 AI 优化
- 根据世界背景生成可编辑、可触发的世界书条目；每个角色可绑定多本独立世界书
- AI 一致性检查可发现时间线、关系、语气、世界书与变量使用冲突
- 本地自动保存草稿、创作资料库、API 预设和界面背景
- 长文本分区与每条开场白均支持一键复制
- 资料库支持搜索、分类筛选、复制与创建副本
- 导出完整角色卡 TXT / Markdown / JSON、SillyTavern V2 JSON 与单本世界书 JSON
- 支持自定义本地背景图；完整备份不会包含 API Key
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
