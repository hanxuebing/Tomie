# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tomie is an article rewriting/style-transfer tool powered by the Claude Agent SDK. Users provide source articles, and an AI agent generates new articles that either transfer the writing style to a new topic or rewrite the content in fresh phrasing. Supports multi-round iterative refinement and multi-task management.

## Development Commands

```bash
bun install              # Install all workspace dependencies (run from root)
bun run dev              # Start both backend (:3700) and frontend (:5173) concurrently
bun run dev:server       # Backend only (Bun with --watch)
bun run dev:web          # Frontend only (Vite dev server, proxies /api → :3700)
cd web && bun run build  # Type-check (vue-tsc) + Vite production build
```

No test framework is configured. No linter is configured.

## Architecture

Bun workspace monorepo with 4 packages:

```
shared/   → @tomie/shared    — TypeScript interfaces consumed by both server and web
agent/    → @tomie/agent     — Framework-agnostic AI rewriting engine (owns Claude Agent SDK dep)
server/   → @tomie/server    — Express 5 HTTP/SSE backend (owns DB, filesystem, routing)
web/      →                  — Vue 3 + Tailwind v4 SPA (Vite, Pinia, Vue Router)
data/     →                  — Runtime data: tomie.db (SQLite) + articles/*.md
```

### Package boundaries (critical)

- **`@tomie/shared`** defines the canonical data types (`Article`, `Task`, `Generation`, `TaskSource`, `LLMModel`, `GenerateRequest`). Both server and web import from here.
- **`@tomie/agent`** exports only: `AgentEngine` interface, `ClaudeAgentEngine` implementation, `VisionEngine`/`ClaudeVisionEngine`, types (`AgentInput`, `AgentEvent`, `LLMSettings`, `ModelEntry`), and prompt builders. It never imports Express, SQLite, or fs.
- **`server/`** is the sole consumer of `@tomie/agent`. The engine singleton lives at `server/services/agent.ts`. Swapping AI providers means changing that one file.
- LLM credentials live in the DB (`llm_global` table), mapped to agent's `LLMSettings` via `server/services/llm.ts::toLLMSettings()`.

### Data flow for generation

1. Frontend calls `POST /api/tasks/:id/generate` → returns immediately.
2. Backend loads source article `.md` files from disk, builds `AgentInput`, calls `runGeneration()`.
3. Engine streams `AgentEvent`s → backend relays via SSE (`GET /api/tasks/:id/stream`).
4. On completion: writes result to `data/articles/<uuid>.md`, inserts `articles` + `generations` rows.

### Database

- **Engine:** SQLite via `bun:sqlite` (in-process, WAL mode, foreign keys ON).
- **Location:** `data/tomie.db` (path hardcoded in `server/db/index.ts`).
- **Schema:** Defined in `server/db/migrate.ts` — runs on every startup (idempotent `CREATE TABLE IF NOT EXISTS`).
- **Tables:** `articles`, `tasks`, `task_sources`, `generations`, `llm_global` (single-row config), `llm_models`.
- **IDs:** UUID v4 strings (not auto-increment integers).

### Frontend

- Vue 3 Composition API + `<script setup>` + TypeScript.
- State: Pinia (no persistent stores currently).
- Routing: Vue Router with history mode. Routes: `/tasks`, `/tasks/new`, `/tasks/:id`, `/articles`, `/articles/:id`, `/settings`.
- Styling: Tailwind CSS v4 (via `@tailwindcss/vite` plugin).
- API client: Axios instance at `web/src/api/index.ts`, base URL `/api`, 120s timeout.
- Markdown: `md-editor-v3` for editing and rendering.
- Path alias: `@` → `web/src/`.

## Key Conventions

- Runtime is **Bun** (not Node.js) — use `bun:sqlite`, `Bun.write()`, `import.meta.dirname`.
- All workspace packages use `"main": "./src/index.ts"` with direct TS source imports (no build step for shared/agent/server).
- Article files are stored as `<uuid>.md` in `data/articles/`. Filenames = article IDs.
- Task creation copies source article files (snapshot isolation between tasks).
- Deleting a task removes `tasks`/`task_sources`/`generations` rows but preserves `articles` rows and `.md` files.
- LLM config defaults seed from env vars `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` on first run, then managed via the Settings UI / DB.
- Models have roles: `text` (generation) and `vision` (OCR). Each role has exactly one default.
- Generation supports two modes: `style_transfer` (new topic, same style) and `rewrite` (same topic, fresh phrasing).

## Language

This is a Chinese-language product. UI text, prompts, error messages, and commit messages are in Chinese.
