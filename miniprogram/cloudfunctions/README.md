# 云函数说明

这些函数按微信云开发入口组织：

- `login`：初始化用户并返回 `openid`。
- `modelProfiles`：模型配置增删查、连接检测、用户 Key 加密保存。
- `generationTasks`：创建生成任务、查询资产历史、删除任务、收藏资产。
- `promptPacks`：同步并缓存提示词来源。

当前实现保留了可本地测试的内存数据库适配层。接入真实微信云开发时，把 `common/db.js` 替换为 `wx-server-sdk.database()` 集合操作，并把 `generation-service.js` 中的示例云存储地址替换为真实 `cloud.uploadFile` 写入。
