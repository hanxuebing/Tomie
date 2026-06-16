import {
  type AgentEngine,
  type AgentInput,
  type AgentEvent,
  type VisionEngine,
  type VisionInput,
  ClaudeAgentEngine,
  ClaudeVisionEngine,
} from '@tomie/agent'
import { toLLMSettings } from './llm'

let engine: AgentEngine = new ClaudeAgentEngine()
let visionEngine: VisionEngine = new ClaudeVisionEngine()

export function getEngine(): AgentEngine { return engine }
export function setEngine(e: AgentEngine) { engine = e }
export function getVisionEngine(): VisionEngine { return visionEngine }
export function setVisionEngine(e: VisionEngine) { visionEngine = e }

export interface RunOptions {
  input: AgentInput
  onEvent: (event: AgentEvent) => void
  signal?: AbortSignal
}

export async function runGeneration(opts: RunOptions): Promise<string> {
  const settings = toLLMSettings()
  let fullContent = ''
  for await (const event of engine.run(opts.input, settings, opts.signal)) {
    opts.onEvent(event)
    if (event.type === 'done') fullContent = event.content
  }
  return fullContent
}

export async function recognizeImage(input: VisionInput, signal?: AbortSignal): Promise<string> {
  const settings = toLLMSettings()
  return visionEngine.recognize(input, settings, signal)
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const settings = toLLMSettings()
  return engine.test(settings)
}
