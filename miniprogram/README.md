# 道听徒说微信小程序版

这是 gotbot / 道听徒说从 Tauri 桌面端迁移到微信小程序的首版工程骨架，目标是先跑通 AI 图像生成核心闭环。

## 技术栈

- Vue 3 + TypeScript + Pinia
- 面向 uni-app / 微信小程序的页面结构，已提供 `src/pages.json` 和 `src/manifest.json`
- 微信云开发云函数、云数据库、云存储

## 目录

- `wechat`：可直接用微信开发者工具打开的原生微信小程序工程。
- `src/domain`：无 Tauri、无 DOM、无 Node 依赖的领域层。
- `src/stores`：小程序端 Pinia 状态和云函数调用。
- `src/pages`：创作、资产、工具、设置、提示词、关于页面。
- `cloudfunctions`：微信云开发函数骨架。

## 本地验证

```bash
npm install
npm run verify:wechat
npm run smoke:cloud
npm run test
npm run typecheck
npm run build:h5
```

本机已额外验证微信开发者工具 CLI：`cli islogin --port 9421` 返回登录状态正常；`cli open --project miniprogram/wechat --port 9421 --disable-gpu` 返回 `✔ open`；`cli preview --project miniprogram/wechat --port 9421 --qr-format image --qr-output /tmp/gotbot-wechat-preview/preview.png --info-output /tmp/gotbot-wechat-preview/info.json` 返回 `✔ preview`；`cli upload --project miniprogram/wechat --port 9421 --version 0.1.2 --desc 'gotbot 小程序首版，云函数已部署'` 返回 `✔ upload`。当前预览/上传包大小约 `35.5 KB`。

云开发环境 `cloud1-d5g01k4t5decfcc5c` 已验证存在，`login`、`modelProfiles`、`generationTasks`、`promptPacks` 已部署并处于 `Active` 状态。由于当前微信开发者工具 CLI 对包含 `common/` 子目录的云函数全量部署会触发 `EISDIR`，部署时先运行 `node wechat/scripts/build-cloudfunction-bundles.cjs /tmp/gotbot-cloudfunctions-bundled` 生成单文件部署包，再从该目录部署云函数。

## 微信小程序部署说明

现在可以直接用微信开发者工具打开 `miniprogram/wechat`：

1. 确认 `wechat/project.config.json` 里的 `appid` 是真实小程序 AppID。
2. 在微信开发者工具中打开 `miniprogram/wechat`。
3. 确认云开发环境为 `cloud1-d5g01k4t5decfcc5c`，或按目标环境更新 `wechat/app.js` 中的 `wx.cloud.init`。
4. 如需重新部署云函数，先运行 `node wechat/scripts/build-cloudfunction-bundles.cjs /tmp/gotbot-cloudfunctions-bundled`，再用微信开发者工具 CLI/GUI 部署生成后的四个函数。
5. 配置云函数环境变量后预览、真机调试或提交审核。

`src/` 目录仍保留 Vue 3/H5 迁移骨架和领域层测试；`wechat/` 是当前用于微信开发者工具部署验证的原生小程序工程。

## 云开发环境变量

平台统一 Key 只放在云函数环境变量中：

- `PLATFORM_IMAGE_API_KEY`
- `PLATFORM_IMAGE_API_SECRET`
- `GOTBOT_MINIPROGRAM_SECRET`：用户 Key 的 AES-GCM 加密密钥，生产环境必须配置。

## 首版范围

- 支持文生图、图生图、封面、ICON、3D 图、GIF 图像链路。
- 支持用户自带 Key 与平台统一 Key。
- 生成结果按云存储语义返回 `cloudFileId` / `remoteUrl`。
- 视频生成、长轮询任务、MP4 播放和复杂导出放入二期。
