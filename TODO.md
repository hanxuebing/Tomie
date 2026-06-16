# TODO

## 模型配置

- [ ] 自动识别模型是否支持多模态（vision）
  - 标准 `/v1/models` 响应不含多模态能力字段
  - 方案 A：读取网关扩展字段（`capabilities`、`type` 等），有则用
  - 方案 B：名称启发式匹配（`vision`、`4o`、`claude-3`/`claude-sonnet-4` 等已知支持视觉的模型族），自动建议 role
  - 需确认实际网关的响应格式后再定方案
  - 用户手动选择 role 作为兜底，不强制绑定

## 复制文章功能

- [ ] 支持复制 Markdown 渲染后的富文本文章内容
  - 任务详情页：任务完成后可一键复制生成的文章
  - 文章库：文章列表/详情页可一键复制文章
  - 复制内容为 Markdown 渲染后的富文本（HTML），粘贴到富文本编辑器（如飞书、Notion、微信公众号编辑器等）时保留格式

---

## 用户认证系统

> 目标：每个用户只能看到自己的数据。

- [ ] 设计 `users` 表（id、email、password_hash、created_at 等）
- [ ] 注册 / 登录接口（密码哈希用 bcrypt/argon2）
- [ ] 会话方案：JWT（无状态，易于云端横向扩展）或 Session
- [ ] 后端鉴权中间件，保护所有 `/api/*` 路由
- [ ] 前端：登录/注册页、Pinia AuthStore、Vue Router 路由守卫、Axios 注入 Authorization 头

## 数据隔离（多用户）

- [ ] 为 `articles` / `tasks` / `generations` 增加 `user_id` 外键
- [ ] 所有查询按当前登录用户过滤（列表、读取、更新、删除均校验归属）
- [ ] LLM 配置区分全局/个人配置

## 云端数据库

> 目标：数据库部署在云端，代码迁移不影响数据。

- [ ] 从本地 SQLite 迁移到云端数据库。候选：
  - **Turso**（libSQL，SQLite 兼容，改动最小，推荐优先评估）
  - **Supabase / Neon**（PostgreSQL，自带 Auth，可顺带解决认证）
  - **PlanetScale**（MySQL）
- [ ] 抽象数据库访问层（当前直接用 `db.prepare()`），便于切换驱动或引入 ORM（如 Drizzle）
- [ ] 数据库连接信息走环境变量（`.env`），不写死路径

## 云端文件存储（Markdown）

> 目标：生成的 .md 文件存储在云端，代码迁移不丢失已生成的文章。

- [ ] 将 `data/articles/*.md` 从本地文件系统迁移到对象存储。候选：
  - **Cloudflare R2**（S3 兼容、无出口流量费，推荐）
  - **AWS S3** / 阿里云 **OSS** / 腾讯云 **COS**
- [ ] 重写 `server/services/files.ts`，用对象存储 SDK 替换 `fs` 调用（保持接口不变，降低改动面）
- [ ] 文件路径按用户分目录（如 `users/{userId}/{ulid}.md`）

## 数据迁移策略

- [ ] 编写一次性迁移脚本：本地 SQLite → 云端数据库，本地 `.md` → 对象存储
- [ ] 迁移时为现有数据分配默认 `user_id`（首个管理员账户）
- [ ] 保留本地备份，迁移后校验数据条数与内容一致

## 落地顺序建议

```
1. 抽象存储层（DB 访问 + 文件服务接口化）
2. 接入云端数据库与对象存储（仍单用户，先跑通）
3. 加用户系统与鉴权
4. 加 user_id 与数据隔离
5. 编写并执行迁移脚本
```
