# Tomie — 文章仿写生成工具

基于 Claude Agent SDK 的文章仿写工具。指定一篇或多篇源文章，通过 agent 综合学习产出新文章，支持多轮迭代修改、多任务管理与文章库。

## 架构

```
shared/     @tomie/shared — 跨包共享类型（Article / Task / Generation 等）
agent/      @tomie/agent — 独立、与框架无关的仿写引擎（拥有 AI 依赖）
            通过 AgentEngine 接口与宿主解耦：换后端不影响 agent，换 agent 不影响后端
server/     @tomie/server — Express 5 + bun:sqlite 后端（业务逻辑：DB / 文件 / HTTP / SSE）
web/        Vue 3 + TS + Tailwind v4 前端
data/       SQLite 数据库与 .md 文章文件
```

### 解耦边界

- `@tomie/shared` 定义基础数据结构（DB 行类型），server 和 web 共同消费。
- `@tomie/agent` 只暴露 `AgentEngine` 接口、`AgentInput`/`AgentEvent`/`LLMSettings` 类型与 `ClaudeAgentEngine` 实现。它不引用 Express、SQLite 或文件系统。
- 后端在 `server/services/agent.ts` 持有唯一的引擎单例。更换 AI 提供方只需替换这一行；更换后端技术栈不会触及 `agent/`。
- LLM 连接配置（baseUrl / apiKey / model）由后端从 DB 读取后映射为 `LLMSettings` 传入。Claude Agent SDK 映射：`apiKey→ANTHROPIC_API_KEY`、`baseUrl→ANTHROPIC_BASE_URL`、`model→options.model`。

## 开发

```bash
bun install              # 根目录一次安装所有 workspace 依赖

bun run dev:server       # 启动后端 :3700
bun run dev:web          # 启动前端 :5173（/api 代理到 3700）
bun run dev              # 同时启动前后端
```

## 配置

首次启动会从 `.env` 写入默认 LLM 配置，之后在「设置」页修改并保存。
注意：「测试连接」使用的是**已保存**的配置，请先保存再测试。

## 核心行为

- **源文章拷贝**：建任务或选历史文章作源时复制 .md，任务间互不影响。
- **删除任务保留文章**：删任务只清 tasks/task_sources/generations，articles 与 .md 保留。
- **文件丢失**：读取时若 .md 不存在，返回 `found:false`，前端显示「文章未找到」。
- **任务状态**：进行中 (running) / 已完成 (completed, cancelled) 两个 Tab。
