# 微信小程序部署验证记录

## 已验证

- `npm run verify:wechat`：通过。验证 `project.config.json`、`app.json`、页面 `js/json/wxml/wxss`、tabBar、云函数入口、自包含 `common/` 和页面事件绑定。
- `npm run smoke:cloud`：通过。验证 `login`、`modelProfiles`、`generationTasks`、`promptPacks` 云函数入口可本地执行，覆盖登录、保存模型、检测模型、创建任务、列表、收藏、提示词同步。
- `node --check`：通过。验证 `miniprogram/wechat` 和 `miniprogram/cloudfunctions` 下所有 JS 文件语法可解析。
- `npm run test`：通过。验证迁移领域层单测。
- `npm run typecheck`：通过。验证 Vue/H5 迁移骨架类型。
- `npm run build:h5`：通过。验证 H5 骨架构建。
- 微信开发者工具 CLI：`cli islogin --port 9421` 返回 `{"login":true}`，说明本机开发者工具 CLI 服务和登录状态可用。
- 微信开发者工具 CLI：`cli open --project miniprogram/wechat --port 9421 --disable-gpu` 返回 `✔ open`，说明原生小程序工程可被开发者工具打开。
- 微信开发者工具 CLI：`cli preview --project miniprogram/wechat --port 9421 --qr-format image --qr-output /tmp/gotbot-wechat-preview/preview.png --info-output /tmp/gotbot-wechat-preview/info.json` 返回 `✔ preview`。
- 预览输出信息：`info.json` 记录总包大小 `36328` Byte（约 `35.5 KB`），二维码图片已生成到 `/tmp/gotbot-wechat-preview/preview.png`。
- 微信开发者工具 CLI：`cli upload --project miniprogram/wechat --port 9421 --version 0.1.2 --desc 'gotbot 小程序首版，云函数已部署' --info-output /tmp/gotbot-wechat-upload/info.json` 返回 `✔ upload`，已上传到微信公众平台版本管理。
- 云开发环境：`cloud env list` 返回 `cloud1-d5g01k4t5decfcc5c`。
- 云函数部署：使用 `wechat/scripts/build-cloudfunction-bundles.cjs` 生成单文件部署包后，`login`、`modelProfiles`、`generationTasks`、`promptPacks` 均部署成功；`cloud functions info` 显示四个函数状态均为 `Active`，运行时为 `Nodejs16.13`。

## 未完成的外部验证

- 已通过微信开发者工具 CLI 预览和代码上传验证；尚未在微信公众平台提交审核/发布正式版。
- 平台模型 Key 环境变量、用户自带 Key 真实调用、真机端到端生成和保存相册仍需用真实模型供应商 Key 验证。

## 部署入口

1. 用微信开发者工具打开 `miniprogram/wechat`。
2. 确认 `project.config.json` 的 `appid` 为真实小程序 AppID。
3. 开通或选择云开发环境。
4. 云函数已部署到 `cloud1-d5g01k4t5decfcc5c`：`login`、`modelProfiles`、`generationTasks`、`promptPacks`。
5. 按需配置云函数环境变量：`PLATFORM_IMAGE_API_KEY`、`PLATFORM_IMAGE_API_SECRET`、`GOTBOT_MINIPROGRAM_SECRET`。
6. 在微信公众平台版本管理中将上传版本设为体验版、提交审核或发布。
