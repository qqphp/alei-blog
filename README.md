# 开发阿雷 · 个人工作站

中文个人博客，包含写作、项目、说说、AI 手记、投资研究、网站收藏与生活记录。前台保留现有视觉和交互，后台位于 `/admin`，通过表单管理内容。

本项目当前按**本地运行**维护。数据库和上传素材都存放在本机，不需要登录 Cloudflare 或 ChatGPT，不会自动发布或上传站点。

## 快速开始

需要 PostgreSQL 18、Node.js **22.13 或以上**和 npm；从旧 D1 导入时还需要 Python 3。在项目根目录执行：

```powershell
npm ci
npm run db:setup
npm run db:migrate
npm run db:import-d1
npm run db:seed-missing
npm run admin:password
npm run dev
```

打开终端打印的本地地址，默认是 [http://localhost:3000](http://localhost:3000)。后台为 [http://localhost:3000/admin](http://localhost:3000/admin)。如开发服务器使用其他端口，后台也使用同一端口。

管理员密码由 `npm run admin:password` 随机生成并显示，同时保存在根目录 `.dev.vars` 中。后台只需要密码，不需要用户名。

### 已经在运行 npm run dev

`db:setup` 默认使用已安装的 PostgreSQL 18 程序，在 `.local/postgres18/` 建立博客专用实例，仅监听 `127.0.0.1:55433`，并创建 `alei_blog` 数据库和同名独立账号。账号使用随机强密码和 SCRAM 认证；连接串写入 `.dev.vars`。本地开发与构建预览会自动启动这个实例。若要使用已有 PostgreSQL 服务，先在 `.dev.vars` 中填写 `PG_ADMIN_URL=postgresql://postgres:经过URL编码的密码@127.0.0.1:5432/postgres`，再运行 `db:setup`；成功后会移除临时管理员连接串。`db:import-d1` 只允许导入到空库，保留旧 D1 文件原样；已有博客内容时运行一次即可。改动 `.dev.vars` 后请重启开发服务。

`npm run admin:password` 检测到已有密码时不会覆盖。忘记密码时执行：

```powershell
npm run admin:password -- --reset
```

随后重启开发服务；旧登录会话会失效。请勿把 `.dev.vars` 发送给别人或提交到版本库。

## 后台可以管理什么

| 栏目                   | 可编辑内容                                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| 站点与导航             | 站点名称、标记、首页 SEO 标题与描述、主导航、生活导航、网站导航、页脚      |
| 首页                   | 首屏标题、简介、眉题和说说推荐区说明；最近写作和项目从相应列表自动取前几项 |
| 写作                   | 标题、摘要、分类、日期、封面、路径标识和独立 Markdown 正文 |
| 写作 → 文章分类        | 层级新增、改名、删除分类与关联检查                                         |
| AI 大模型设置          | API 地址、模型、连接测试，以及各类图片独立尺寸、风格与提示词                 |
| 项目                   | 项目表格、状态 / 分类选项、摘要、图片集、标签与 Markdown 项目说明；列表可按项目状态筛选 |
| 说说                   | 表格管理、正文、多话题、精确到秒的日期选择、图片上传与 AI 生成；标签页配置封面轮播 |
| 个人资料               | 微信、邮箱、公众号二维码、服务链接、平台入口                               |
| AI 手记、提示词便签    | 作品与使用笔记、类型、状态、正文段落、链接、完整提示词                     |
| 投资研究               | 主题分组、研究条目和正文段落                                               |
| 书签、友链             | 名称、网址、分类、介绍、标签或头像文字                                     |
| 书籍、主题书单         | 作者、笔记、封面，以及书单里单独填写的书名和作者                           |
| 音乐                   | 栏目标题和简介、歌曲名称、作者、音频地址、时长与播放场景                   |
| 电影、播客、旅行、爱好 | 栏目简介、分类、记录和正文段落                                             |

后台各内容列表由数据库分页，每页最多读取 20 条摘要。搜索、分类和发布状态筛选在数据库执行；写作搜索包含正文，投资搜索包含笔记段落。打开编辑表单时才读取一条完整记录。站点、首页、生活栏目标题和简介、AI 设置分别保存。生活页头一侧的短句仍写在组件中。音乐列表按场景筛选。书单保存的是书名和作者，改书籍记录不会自动改书单。歌单同样保存曲目名称和作者。

### 编辑、排序与发布

1. 登录后台，选择栏目和记录；新增或编辑时填写表单。
2. 点击表单底部「确认提交」后，当前记录立即入库。未提交就离开表单会提示放弃修改。
3. 列表中的发布、转草稿、上移、下移点击后立即入库；删除先确认，成功后从列表移除。
4. 点击「查看前台」或刷新已打开的前台页面查看结果。

记录默认作为草稿创建。草稿在服务端过滤，不会出现在前台 HTML 或公开详情中。两个窗口修改同一记录时，旧版本提交会返回冲突，表单内容保留供手动合并。分类和状态选项也是独立记录；改名后，关联记录继续按稳定 ID 读取显示名称。仍被使用的分类、状态或分组不可删除。

写作正文使用 Markdown 编辑器。文章封面和部分其他栏目图片可以上传或生成；AI 图片生成完毕后随当前记录一起提交。生成失败时表单内容保留。
### 素材上传

图片 / 音频字段旁可直接「上传替换」，也可在素材库上传后复制地址。支持 PNG、JPEG、WebP、GIF、MP3、WAV，单文件最大 **20 MB**。后端按文件头检查格式，不接受 HTML 或 SVG 上传。

上传后点击当前表单的「确认提交」，才会更换页面使用的素材。返回地址形如 `/api/media/…`。这些素材地址公开可访问，草稿过滤不等于素材保密。已有 `public/` 素材仍可直接填写路径，例如 `/covers/writing-notes.png`；素材库列表显示后台上传或 AI 生成的文件。

删除内容或更换素材后，服务端核对素材是否仍被引用；确认无引用才清理本地文件。当前素材库提供上传、列出、查看和复制地址。

## 数据与备份

- 结构化内容：本机 PostgreSQL `alei_blog` 数据库；默认实例位于 `.local/postgres18/`，连接信息位于 `.dev.vars`。
- 上传文件与 AI 生成图片：普通本地文件，位于 `.local/media/`。
- 管理员密码：`.dev.vars`。
- 默认内容：`lib/cms-defaults.ts`、`lib/article-seed.json` 及原有数据模块。

数据源是服务端数据库，**不是浏览器 localStorage**。刷新、换浏览器、重启开发服务后仍保留。现有数据已迁移为逐条记录，缺失的默认栏目由 db:seed-missing 补齐；清空列表不会重新出现默认条目。

### 完整本地备份

定期执行 `npm run db:backup`，它会把 PostgreSQL 自定义格式备份和 `.local/media` 素材复制到 `.local/backups/` 下的带时间戳目录。也可指定外部硬盘目录：`npm run db:backup -- E:\你的备份目录`。请单独妥善备份 `.dev.vars` 和 `.local/postgres18/admin-password`。恢复时先用 `pg_restore` 恢复数据库，再还原素材目录。数据库备份包含内容与后台保存的 API 密钥，请保护备份文件；只保存在项目所在硬盘不足以应对硬盘故障。

`.wrangler/`、`.local/`、`.dev.vars`、测试临时文件和构建产物均已加入 Git 忽略规则。旧 D1 状态保留作迁移核对；不要删除 `.local/postgres18` 或 `.local/media`，否则数据库或上传素材会丢失。

## 开发命令

| 命令                     | 用途                                                                |
| ------------------------ | ------------------------------------------------------------------- |
| `npm run dev`            | 启动本地开发服务器                                                  |
| `npm run build`          | 生成前台和 Worker 构建产物，不发布                                  |
| `npm start`              | 在本地预览构建产物，默认端口 8787；使用相同的本地数据目录和密码文件 |
| `npm run db:setup`       | 创建 PostgreSQL 博客数据库和独立账号                               |
| `npm run db:migrate`     | 在 PostgreSQL 中创建或更新博客表及索引                              |
| `npm run db:import-d1`   | 将旧 D1 内容一次性导入空的 PostgreSQL 数据库                       |
| `npm run db:seed-missing` | 补齐数据库中缺失的默认栏目和记录，重复执行不会覆盖已有内容        |
| `npm run db:backup`      | 备份 PostgreSQL 数据和上传素材                                    |
| `npm run admin:password` | 首次生成管理员密码                                                  |
| `npm run typecheck`      | TypeScript 类型检查                                                 |
| `npm run test:cms`       | 在独立测试数据库运行逐条读写与冲突集成测试                           |
| `npm run test:admin-ui`  | 现有组件交互测试                                                   |
| `npm run test:content-order` | 前台写作、项目、说说的排序与分页                             |
| `npm run test:admin-granular-ui` | 逐条保存后台交互测试                                        |
| `npm run test:pond-motion` | 投资池塘里锦鲤的游动边界                                      |
| `npm run test:pond-lifecycle` | 投资池塘的显示、暂停和尺寸变化                             |
| `npm run test:film-ai`   | 电影封面生成请求与失败保留                                      |
| `npm run lint`           | 全项目静态检查                                                      |

`npm start` 前需要先执行 `npm run build`。它只运行本地 Wrangler，不上传任何内容。

### 验证范围

`npm run test:cms` 从本地备份恢复到临时独立数据库，执行迁移、逐条读写、版本冲突、分类关联及千条记录分页验证，结束时删除测试库。运行前先执行 `npm run db:backup` 和 `npm run build`。后台交互用 Happy DOM 测试，生产数据库不会被测试写入。

## 项目结构

```text
app/                    前台页面、/admin 与服务端 API
components/             前台组件、后台表单、内容 Context
lib/cms-defaults.ts     管理栏目与默认数据
lib/cms-server.ts       PostgreSQL 读写与公开内容读取
lib/cms-validation.ts   字段校验、草稿过滤
lib/admin-auth.ts       登录会话与请求保护
db/migrations/          PostgreSQL 版本化表结构与索引
scripts/               密码初始化与集成测试
scripts/local-media-storage.mjs  仅监听本机的文件存储服务
public/                项目自带静态素材
vite.config.ts         Vinext / Cloudflare 本地运行配置
```

技术栈：React 19、TypeScript、Vinext / Vite、PostgreSQL 18、Node.js 本地文件存储、React Markdown。使用单管理员密码、8 小时 HttpOnly / SameSite 会话、服务端权限检查和持久化登录限流；没有多用户、角色分配或找回密码邮件流程。

## 常见问题

- **看到「请先配置密码」**：运行 `npm run admin:password`，随后重启开发服务。
- **提示数据库表不存在**：检查 `.dev.vars` 中的 `DATABASE_URL`，在项目根目录执行 `npm run db:migrate`，然后重启。
- **更新代码后旧开发进程报错**：本次增加了运行时绑定并安装依赖，需要完整重启一次，单纯刷新浏览器不能代替重启。
- **保存后看不到内容**：确认已提交当前记录、条目已发布、前台筛选条件没有隐藏它，并刷新前台。
- **书单里的书名没有跟着书籍记录变化**：书单单独保存书名和作者。需要在书单里改对应一行。
- **忘记密码**：运行 `npm run admin:password -- --reset` 后重启。
- **本地请求受代理影响**：检查代理的 localhost 排除设置；命令行可使用 `curl.exe --noproxy "*" http://localhost:3000/`。
- **准备部署到服务器**：本 README 只覆盖本地使用；需要另外配置生产存储、密钥和 HTTPS。本项目不会自动执行部署。
