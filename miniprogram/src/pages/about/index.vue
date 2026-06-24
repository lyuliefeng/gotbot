<template>
  <section class="page">
    <div class="section">
      <h2>关于小程序版</h2>
      <p>这是道听徒说的微信小程序首版迁移工程，目标是先交付 AI 图像生成核心闭环。</p>
      <p class="muted">桌面端的本地 SQLite、Tauri IPC 和本地导出目录已替换为微信云开发、云存储和小程序相册/分享语义。</p>
    </div>
    <div class="section">
      <h3>隐私与密钥</h3>
      <p>用户 Key 只提交给云函数加密保存，平台 Key 只存在云函数环境变量。小程序前端不保存明文平台 Key。</p>
    </div>
    <div class="section">
      <h3>二期范围</h3>
      <p class="muted">视频生成、任务轮询、MP4 云存储播放、复杂 GIF 帧处理和高级导出文件会在二期继续补齐。</p>
    </div>
  </section>
</template>
