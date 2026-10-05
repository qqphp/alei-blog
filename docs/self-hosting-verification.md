# 自托管改造验证记录

日期：2026-10-05。所有改动和演练均在本机进行，未向个人 VPS 发布。

## 已交付

- 应用统一为 Vinext Node 开发服务和 `dist/standalone/server.js`；开发与生产使用 `.env` 或进程环境变量。
- 删除项目直接使用的 Worker 绑定、Wrangler、D1 导入/导出、素材和 AI HTTP sidecar，以及测试 loader 的运行时替换。
- PostgreSQL 使用 `DATABASE_URL`；文件存储直接访问 `CMS_MEDIA_DIRECTORY`，AI 出站支持代理。
- 备份/恢复使用系统 PostgreSQL 工具；恢复拒绝覆盖已有库和素材；每日备份示例保留 14 天已完成备份。
- 提供 `.env.example`、生产环境示例、systemd 应用/备份/timer、Nginx 片段及 [从零部署指南](self-hosting.md)。
- 保留 `@openai/sites-vite-plugin`。锁文件仅剩 PostgreSQL 驱动自身的可选 `pg-cloudflare`，应用不调用它。

## 验证结果

| 项目 | 结果 |
| --- | --- |
| Windows Node.js 22.23.1：`npm ci`、类型检查、静态检查 | 通过；安装时先停止占用原生模块的开发进程 |
| Windows：Node 开发服务、后台登录、数据库配置读取、前台 SSR | 通过 |
| Windows 和 Ubuntu 26.04 WSL：Node 独立构建 | 通过 |
| Linux Node.js 22.23.1 + PostgreSQL 18.6：干净源码初始化 | 通过；没有预置 `.env`、旧状态、数据库或媒体目录 |
| Linux：重复初始化 | 通过；示例内容保持 5 篇文章、146 条 CMS 记录、19 个栏目文档 |
| 另一个 `DATABASE_URL` 指向已创建数据库：连接、迁移、初始化 | 通过；未创建应用专用本地实例 |
| 当前个人数据库和媒体：备份、复制、恢复 | 通过；全部表记录数量、文章正文与封面一致，全部素材及元数据 SHA-256 一致；源库保留 4 篇文章、111 条 CMS 记录 |
| 空管理员密码生成、已有密码保留、拒绝恢复到非空目标、备份过期清理 | 通过 |
| Node 生产入口：登录、HTTPS 转发、Secure Cookie、同源保护、Range/ETag、重启后素材读取 | 通过 |
| Linux 实际 Nginx 1.28.3 + 临时 HTTPS 证书 | 通过；后台登录、数据库保存、20 MB 上传、Range；超限请求返回 413 |
| systemd 应用/备份/timer 与每日调度 | 语法验证通过；验证副本使用本机临时目录和程序路径，未安装或启用生产系统服务 |
| `test:cms`、`test:audit-regressions`、`test:self-hosting` | 通过 |
| `test:media-upload`、`test:film-ai`、`test:aa-cache`、`test:server-fetch` | 通过 |
| Markdown、前台分页/排序/远程列表、后台逐条表单、池塘运动/生命周期回归 | 通过 |
| 源码与构建产物密钥检查、Git diff 检查、运行时残留检查 | 通过；本地密钥未写入版本文件或构建产物 |

## 尚需处理或在真实环境验收

1. `test:admin-ui` 在原有第 470 行失败：测试断言页面不存在 Artificial Analysis 链接，但页面已有该链接。原断言打印 DOM 时触发内存分配错误；临时诊断副本确认真实失败为 `true !== false`。本次未改变相关页面或断言。
2. 依赖审计报告 13 条公告（11 high、1 moderate、1 low），涉及现有 Vinext、Vite、React RSC、Sharp、Undici 及传递依赖。此次保留现有版本，未执行自动升级；正式上线前应单独升级并回归。
3. 外部连接路径已验证，实际外部 PostgreSQL 提供商的网络、证书及账号权限仍须在 VPS 验收。Linux 演练的两个数据库由同一个隔离 PostgreSQL 服务提供。
4. AI 请求使用模拟响应验证请求结构、转换与失败行为；代理使用真实本地 CONNECT 隧道验证。没有向收费 API 发起生成请求。
5. VPS 的 systemd 启动、定时备份、真实域名、证书和 Nginx 配置仍需按部署指南安装并验收。

验证日志保存在本机被忽略的 `outputs/self-hosting/`。Linux 临时数据已清理；自动审批拒绝递归删除本机 `.local/linux-check`（返回 `blocked by policy`，没有更具体原因），因此该临时工具目录被保留，仍受 Git 忽略规则保护。

旧本地数据和密钥文件未删除；旧环境文件和状态目录仅加入当前 checkout 的本地 Git 排除规则。运行配置已读取 `.env`，不依赖这些旧文件。
