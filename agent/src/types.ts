// ── The contract between the host application and the agent ──────────────
// This file is the ONLY thing the backend needs to know about the agent.
// Nothing here references Express, SQLite, the filesystem, or any host concern.

/** Shared auth for the Anthropic gateway. */
export interface AuthSettings {
  authToken: string   // ANTHROPIC_AUTH_TOKEN
  baseUrl: string     // ANTHROPIC_BASE_URL
}

/** A single model entry. */
export interface ModelEntry {
  id: string          // unique key e.g. "text-main"
  role: 'text' | 'vision'
  name: string        // display label e.g. "Claude 3.5 Sonnet"
  model: string       // API model identifier e.g. "claude-sonnet-4-20250514"
  isDefault?: boolean // the default model picked for its role when none is requested
}

/** Full config passed from host → agent. */
export interface LLMSettings {
  auth: AuthSettings
  models: ModelEntry[]
}

/**
 * Resolve which model to use for a role.
 * Preference order: explicit `preferredId` (must match the role) → the role's
 * default → the first model of that role.
 */
export function resolveModel(
  settings: LLMSettings,
  role: 'text' | 'vision',
  preferredId?: string,
): ModelEntry | undefined {
  const ofRole = settings.models.filter(m => m.role === role)
  if (preferredId) {
    const requested = ofRole.find(m => m.id === preferredId)
    if (requested) return requested
  }
  return ofRole.find(m => m.isDefault) ?? ofRole[0]
}

/** Helper to pick the default (or first) model for a given role. */
export function pickModel(settings: LLMSettings, role: 'text' | 'vision'): ModelEntry | undefined {
  return resolveModel(settings, role)
}

/** Plain input the host hands to the engine. No file paths, no DB rows. */
export interface AgentInput {
  /** Raw source article contents (already loaded by the host). */
  sources: string[]
  /** User instruction / topic / revision request. */
  prompt: string
  /** Previous draft, when iterating on an earlier generation. */
  previousDraft?: string
  /** Optional model id — when provided, the engine should prefer this model. */
  modelId?: string
}

/** Streamed output events. The host decides how to surface them (SSE, logs…). */
export type AgentEvent =
  | { type: 'step'; step: string }
  | { type: 'chunk'; content: string }
  | { type: 'done'; content: string }

/** The port. Any AI backend (Claude Agent SDK, OpenAI, local…) implements this. */
export interface AgentEngine {
  readonly name: string
  run(
    input: AgentInput,
    settings: LLMSettings,
    signal?: AbortSignal,
  ): AsyncIterable<AgentEvent>
  test(settings: LLMSettings): Promise<{ ok: boolean; message: string }>
}

/** Input for the vision OCR engine. */
export interface VisionInput {
  /** Base64-encoded image data. */
  imageBase64: string
  /** MIME type, e.g. 'image/png'. */
  mimeType: string
  /** Optional user hint about what the image contains. */
  hint?: string
}

/** The vision engine contract. */
export interface VisionEngine {
  readonly name: string
  recognize(
    input: VisionInput,
    settings: LLMSettings,
    signal?: AbortSignal,
  ): Promise<string>
}
