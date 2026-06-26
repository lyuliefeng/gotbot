# 微信小程序部署验证记录

更新时间：2026-06-25 23:19（Asia/Shanghai）

说明：以下记录只保留有本地命令输出、CloudBase 状态、微信开发者工具 CLI 输出或产物文件支撑的结论；未能从证据中确认的发布/审核状态单独列在“未完成的外部验证”。

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
- 真实图像模型调用验证：`artifacts/api-perf/image-api-perf-2026-06-25T15-18-06-746Z.json` 记录 3 个模型端点测试，其中 2 个 `agnes-image-2.1-flash` 端点返回 `200` 并生成 1024x1024 PNG 图片，1 个 `https://api.lvliefeng.top/v1/images/generations` 端点返回 `404`。
- 真实图像生成产物：
  - `artifacts/api-perf/2026-06-25T15-18-06-746Z-model-mpzfzzac-hodrn8-run1.png`，PNG，1024x1024，约 1.1 MB；API 耗时 `26606ms`，总耗时 `33459ms`。
  - `artifacts/api-perf/2026-06-25T15-18-06-746Z-agnes-image-run1.png`，PNG，1024x1024，约 1.1 MB；API 耗时 `24788ms`，总耗时 `31941ms`。

## 未完成的外部验证

- 已通过微信开发者工具 CLI 预览和代码上传验证；尚未从本地证据中确认微信公众平台是否已提交审核、是否审核通过、是否发布正式版。
- 平台 Agnes 图像模型调用已用真实端点验证 2 次成功；仍未完成真机端到端扫码验证、保存相册验证、以及用户自带 Key 的真实调用验证。
- `https://api.lvliefeng.top/v1/images/generations` 图像端点在 2026-06-25 的记录中返回 `404`，需要单独确认该代理端点的路由或模型配置。

## 部署入口

1. 用微信开发者工具打开 `miniprogram/wechat`。
2. 确认 `project.config.json` 的 `appid` 为真实小程序 AppID。
3. 开通或选择云开发环境。
4. 云函数已部署到 `cloud1-d5g01k4t5decfcc5c`：`login`、`modelProfiles`、`generationTasks`、`promptPacks`。
5. 按需配置云函数环境变量：`PLATFORM_IMAGE_API_KEY`、`PLATFORM_IMAGE_API_SECRET`、`GOTBOT_MINIPROGRAM_SECRET`。
6. 在微信公众平台版本管理中将上传版本设为体验版、提交审核或发布。
