// @tomie/agent — standalone, framework-agnostic article-rewriting engine
//
// The host application never imports anything except what's re-exported here.
// This package owns the AI dependency and prompt logic; the host owns DB, FS, HTTP.

export type {
  AgentEngine,
  AgentInput,
  AgentEvent,
  LLMSettings,
  AuthSettings,
  ModelEntry,
  VisionEngine,
  VisionInput,
} from './types'

export { pickModel, resolveModel } from './types'
export { ClaudeAgentEngine } from './engines/claude'
export { ClaudeVisionEngine } from './engines/vision'
export { buildSystemPrompt, buildUserPrompt } from './prompts'
