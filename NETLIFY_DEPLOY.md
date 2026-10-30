# Netlify 部署说明

本项目已经同时支持原有的本地开发方式和 Netlify 的 Next.js 全栈部署。

## 首次生成网址

1. 登录 [Netlify](https://app.netlify.com/)。
2. 选择 **Add new project → Import an existing project**。
3. 选择 GitHub，并授权读取 `xiewanyixw1-gif/Char`。
4. 选择 `Char` 仓库，生产分支使用 `main`。
5. 保留仓库中 `netlify.toml` 提供的设置，发布目录留空，然后开始部署。
6. 部署完成后会得到一个 `https://项目名.netlify.app` 网址；可以在 Domain management 中修改站点名或绑定自己的域名。

## 后续更新

提交并推送到 GitHub 的 `main` 分支后，Netlify 会自动构建并更新同一个网址。只在本地修改、但没有推送到 GitHub 的内容不会发布。

网页里填写的角色卡、世界书、界面背景和 API 预设仍然保存在当前浏览器，不会自动同步到其他设备。请使用网页中的导出功能备份重要内容。

## API Key

本项目采用使用者自带 API Key 的方式，不需要把个人 API Key 添加到 Netlify。Key 只保存在当前浏览器，并在生成时通过本站的 `/api/generate` 路由转发到所选服务商。
