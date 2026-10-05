# Node.js 自托管部署

目标：Ubuntu / Debian、systemd、Node.js >=22.13.0、PostgreSQL 18；已有 Nginx 和 HTTPS。应用只监听 `127.0.0.1:3000`，数据库可同机或外部。新克隆保留仓库示例内容和“开发阿雷”品牌，首次登录后自行替换。

## 1. 准备程序和目录

安装适合服务器发行版的 Node.js 与 PostgreSQL 18 客户端；同机数据库还需 PostgreSQL 18 服务端。使用 [Node.js 官方下载](https://nodejs.org/en/download) 和 [PostgreSQL 官方 apt 仓库说明](https://www.postgresql.org/download/linux/ubuntu/)。不要直接使用发行版默认的旧 Node.js。确认以下程序可用：

```sh
node --version
npm --version
pg_dump --version
pg_restore --version
```

下面用 `/usr/bin/node`；若安装到其他目录，修改两个 service 的 ExecStart，避免 systemd 依赖交互 shell 的 nvm 配置。`pg_dump` 应为 18，且不能低于源服务器主版本。

```sh
sudo useradd --system --user-group --home-dir /var/lib/alei-blog --shell /usr/sbin/nologin alei-blog
sudo install -d -o alei-blog -g alei-blog -m 0700 /var/lib/alei-blog/media /var/backups/alei-blog
sudo install -d -o root -g alei-blog -m 0750 /etc/alei-blog
sudo install -d -o "$USER" -g alei-blog -m 0750 /opt/alei-blog
```

在 `/opt/alei-blog` 克隆自己的仓库（替换仓库地址），或将完整源代码复制到此目录：

```sh
git clone YOUR_REPOSITORY_URL /opt/alei-blog
cd /opt/alei-blog
npm ci
```

保留生产源码、`scripts/`、`db/` 和根目录 node_modules，供迁移与备份使用。应用运行入口为独立构建目录。需要完整开发依赖来构建；不要在构建前使用 `npm ci --omit=dev`。

## 2. 配置数据库

### 同机 PostgreSQL 18

启动已安装的 PostgreSQL 服务，再创建专用账号和空库：

```sh
sudo systemctl enable --now postgresql
sudo -u postgres psql
```

在 psql 中执行：

```sql
CREATE ROLE alei_blog LOGIN;
\password alei_blog
CREATE DATABASE alei_blog OWNER alei_blog ENCODING 'UTF8';
\q
```

使用密码认证的 TCP 连接，保持数据库仅监听本机。把生成的密码进行 URL 编码后填入 `DATABASE_URL`，不要使用 postgres 超级用户运行应用。

### 外部 PostgreSQL

在外部服务创建数据库和专用账号；账号需能在自己的库中创建表、索引、修改数据和备份。将服务商连接串写入 `DATABASE_URL`。按服务商要求配置 TLS，例如 `?sslmode=verify-full&sslrootcert=/etc/alei-blog/database-ca.pem`；证书需对服务用户可读。限制允许连接的 IP 为 VPS 出口地址。外部服务不需要本地 PostgreSQL 服务端，但备份恢复需要本地 18 客户端。不要把 `.local/postgres18` 上传到服务器。

## 3. 配置独立生产密钥

```sh
sudo install -o root -g alei-blog -m 0640 deploy/alei-blog.env.example /etc/alei-blog/alei-blog.env
sudoedit /etc/alei-blog/alei-blog.env
```

替换 `DATABASE_URL` 与 `ADMIN_PASSWORD`。密码至少 12 位，应使用新的随机值（例如 `openssl rand -hex 24`）。生产环境不复制本地 `.env`；AI 密钥可在后台单独配置。素材目录必须是持久化绝对路径，不能放在会随升级替换的 `dist` 下。

配置格式使用 `KEY=value`，URL 中密码先编码；不要加 `export` 或 shell 命令。systemd 通过 EnvironmentFile 注入，Node/Vite 也支持根目录 `.env`；进程环境优先。配置中不要使用 `VITE_` 前缀存放密钥。`HTTP_PROXY` / `HTTPS_PROXY` 只影响 AI / 大模型出站请求；`NO_PROXY` 可排除地址。管理员密码和 API 密钥只由服务端模块读取。

命令行初始化与迁移可直接使用 Node 的环境文件选项，不把密码放进 shell 历史或参数：

```sh
sudo -u alei-blog /usr/bin/node --env-file=/etc/alei-blog/alei-blog.env scripts/setup-postgres.mjs
```

这条命令验证已配置的 `DATABASE_URL`，不会替换账号或数据。后续选择**新站**或**现有个人数据迁移**。

## 4A. 新克隆从零初始化

```sh
sudo -u alei-blog /usr/bin/node --env-file=/etc/alei-blog/alei-blog.env scripts/migrate-postgres.mjs
sudo -u alei-blog /usr/bin/node --env-file=/etc/alei-blog/alei-blog.env --import tsx scripts/seed-missing-sections.mjs
sudo -u alei-blog /usr/bin/node --env-file=/etc/alei-blog/alei-blog.env scripts/prepare-media.mjs
```

等价于本地 `npm run db:init`。重复执行不会覆盖已修改内容；完整栏目已经存在时，清空列表不会重新写入示例记录。不需要 Python、旧环境状态或额外数据导入。仓库 `public/` 中的素材作为静态文件随构建发布。

## 4B. 迁移当前 PostgreSQL 和素材

本地停止编辑和上传，执行 `npm run db:backup`。备份目录包含 `database.dump`、`media/`（含 `.metadata/`）和成功标记 `complete.json`。备份持有数据库排他锁以阻止内容写入和引用回收；未提交的上传仍可能写入，所以迁移期间停用编辑、上传和 AI 生图。

通过 SCP/SFTP 传输完整备份目录到 VPS（示例路径 `/var/backups/alei-blog/alei-TIMESTAMP`），赋予 alei-blog 用户读取权限。备份含后台配置的 API 密钥，禁止放在 public 或 Nginx 静态目录中。

**先恢复到新建空库和空素材目录，再执行迁移；不要先运行示例初始化。**

```sh
sudo -u alei-blog /usr/bin/node --env-file=/etc/alei-blog/alei-blog.env scripts/restore-postgres.mjs /var/backups/alei-blog/alei-TIMESTAMP
sudo -u alei-blog /usr/bin/node --env-file=/etc/alei-blog/alei-blog.env scripts/migrate-postgres.mjs
sudo -u alei-blog /usr/bin/node --env-file=/etc/alei-blog/alei-blog.env --import tsx scripts/seed-missing-sections.mjs
```

恢复拒绝非空库和非空素材目录；数据库恢复用一个事务。若素材目录切换失败，数据库可能已恢复成功，此时先核对备份与日志，不要对同一个非空库重试；可从原备份人工补齐素材，或使用另一空库和目录重新恢复。源库不会被修改。使用新生产密码登录后，核对文章/各栏目记录数量，抽查图片、音频、Markdown 附件和编辑；确认完成后再关闭原服务。

核对数量可用只读 SQL：

```sql
SELECT count(*) FROM articles;
SELECT section, collection, count(*) FROM cms_entries GROUP BY section, collection ORDER BY section, collection;
SELECT count(*) FROM cms_sections;
```

## 5. 构建并由 systemd 启动

构建无需读取生产密钥。已注入本地环境时请避免把生产密码写入构建命令。

```sh
cd /opt/alei-blog
npm run build
sudo chgrp -R alei-blog /opt/alei-blog
sudo chmod -R g+rX /opt/alei-blog
sudo install -m 0644 deploy/alei-blog.service /etc/systemd/system/
sudo install -m 0644 deploy/alei-blog-backup.service deploy/alei-blog-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now alei-blog.service
curl --noproxy '*' http://127.0.0.1:3000/api/admin/session
sudo journalctl -u alei-blog -n 50 --no-pager
```

`npm start` 也可启动同一产物，但 systemd 模板直接运行 `dist/standalone/server.js`，不会启动任何本地专用数据库。构建必须在目标 Linux 平台进行，避免复制 Windows Sharp 原生二进制。独立输出包含运行时依赖、静态文件；系统服务只允许写 `/var/lib/alei-blog`。

## 6. 接入现有 Nginx / HTTPS

参考 `deploy/nginx.conf.example`，把 upstream 放入 http 上下文，把 location 内容加入现有 HTTPS server。使用至少 `client_max_body_size 20m`（示例 25m），实际应用仍限制单文件 20 MB。保留 `Host $http_host`，设置 `X-Forwarded-Proto $scheme`，配置 300 秒读写超时以支持 AI 请求和流式响应。

应用设置 `VINEXT_TRUST_PROXY=1` 以识别 HTTPS 并签发 Secure Cookie。端口 3000 仅监听回环，不能直接公开；Nginx 应覆盖转发头。保持唯一的公开域名及 HTTPS 重定向。修改后自行执行 `sudo nginx -t`、reload。

验收：HTTPS 登录返回 HttpOnly / Secure / SameSite Cookie；错误 Origin 写请求返回 403；新增草稿、提交内容、上传接近 20 MB 文件、读取 Range、删除共享素材、生图及 AI 文本请求均正常。重启 `alei-blog` 后核对数据库与素材仍在；草稿不会在前台发布。普通 SSH curl 不应把密码或 Cookie 打印到共享日志。

## 7. 每日备份和升级回退

先手动跑一次备份服务，再启用 timer：

```sh
sudo systemctl start alei-blog-backup.service
sudo journalctl -u alei-blog-backup -n 30 --no-pager
sudo systemctl enable --now alei-blog-backup.timer
systemctl list-timers alei-blog-backup.timer
```

默认每天服务器时区 03:30 后随机延迟最多 15 分钟，保留 14 天。仅删除脚本识别的、已完成且到期的备份目录；旧备份未包含成功标记的不会自动删。将备份另复制到其他主机或硬盘；单机备份不能应对磁盘故障。备份失败可从 service 日志查看，timer 本身不发送通知。保护环境文件与证书，并单独保存其恢复方法。

升级前停止编辑，备份数据库和素材，保存旧代码版本与 Linux 构建产物；停止应用后更新代码、`npm ci`、`npm run build`、执行迁移，再启动并验收。素材和环境文件位于代码目录外，升级不覆盖它们。若升级失败，停止服务，回退代码和构建；涉及数据库结构变化时恢复到新的空数据库和素材目录，改环境配置再启动，避免直接覆盖原库。环境文件更新后执行 `sudo systemctl restart alei-blog`。

## 本地回归命令

```powershell
npm ci
npm run db:setup
npm run db:init
npm run typecheck
npm run lint
npm run build
npm run db:backup
npm run test:cms
npm run test:audit-regressions
npm run test:self-hosting
npm run test:server-fetch
npm run test:media-upload
npm run test:film-ai
npm run test:aa-cache
```

`test:cms` 与 `test:audit-regressions` 使用 Windows 本地专用实例的管理员连接建立隔离测试库，结束后删除。`test:self-hosting` 默认也使用本地实例；可通过 `PG_ADMIN_URL` 指定隔离验证服务的管理员连接（需要创建、删除临时库权限）。它读取源库做备份，恢复到临时库和临时媒体目录，核对记录和文件，不向源库写入。不要把这些测试作为外部生产服务的初始化命令。其余 UI 回归命令见 README。
