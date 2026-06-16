import { query } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEngine, AgentInput, AgentEvent, LLMSettings } from '../types'
import { pickModel, resolveModel } from '../types'
import { buildSystemPrompt, buildUserPrompt } from '../prompts'

/**
 * ClaudeAgentEngine — drives generation through the Claude Agent SDK.
 *
 * Connection settings map onto the SDK's environment:
 *   auth.authToken -> ANTHROPIC_AUTH_TOKEN
 *   auth.baseUrl   -> ANTHROPIC_BASE_URL   (point this at Anthropic or a compatible gateway)
 *   models         -> pickModel(settings, 'text') for the model identifier
 *
 * The engine runs as a pure text generator: no tools, no filesystem access.
 */
export class ClaudeAgentEngine implements AgentEngine {
  readonly name = 'claude-agent-sdk'

  private buildEnv(settings: LLMSettings): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string') env[k] = v
    }
    env.ANTHROPIC_AUTH_TOKEN = settings.auth.authToken
    if (settings.auth.baseUrl) env.ANTHROPIC_BASE_URL = settings.auth.baseUrl
    return env
  }

  private bridgeSignal(signal?: AbortSignal): AbortController | undefined {
    if (!signal) return undefined
    const ac = new AbortController()
    if (signal.aborted) ac.abort()
    else signal.addEventListener('abort', () => ac.abort(), { once: true })
    return ac
  }

  async *run(
    input: AgentInput,
    settings: LLMSettings,
    signal?: AbortSignal,
  ): AsyncIterable<AgentEvent> {
    const entry = resolveModel(settings, 'text', input.modelId)
    if (!entry) throw new Error('未配置文本模型，请在设置中添加 text 模型')

    const system = buildSystemPrompt(input.sources.length > 1)
    const user = buildUserPrompt(input)

    yield { type: 'step', step: '正在生成...' }

    const response = query({
      prompt: user,
      options: {
        model: entry.model,
        systemPrompt: system,
        allowedTools: [],
        permissionMode: 'bypassPermissions',
        includePartialMessages: true,
        env: this.buildEnv(settings),
        abortController: this.bridgeSignal(signal),
      },
    })

    let streamed = ''
    let assistantText = ''
    let resultText = ''

    for await (const message of response as AsyncIterable<any>) {
      if (signal?.aborted) break

      if (message.type === 'stream_event') {
        const ev = message.event
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          const t: string = ev.delta.text ?? ''
          if (t) {
            streamed += t
            yield { type: 'chunk', content: t }
          }
        }
      } else if (message.type === 'assistant') {
        const blocks = message.message?.content ?? []
        const text = blocks
          .filter((b: any) => b?.type === 'text')
          .map((b: any) => b.text ?? '')
          .join('')
        if (text) assistantText = text
      } else if (message.type === 'result') {
        if (message.subtype === 'success' && typeof message.result === 'string') {
          resultText = message.result
        }
      }
    }

    // Authoritative final text: assistant message > result > whatever streamed.
    const full = assistantText || resultText || streamed

    // If nothing streamed incrementally, surface the full text once.
    if (!streamed && full) {
      yield { type: 'chunk', content: full }
    }

    yield { type: 'done', content: full }
  }

  async test(settings: LLMSettings): Promise<{ ok: boolean; message: string }> {
    const entry = pickModel(settings, 'text')
    if (!entry) return { ok: false, message: '未配置文本模型，请在设置中添加 text 模型' }

    try {
      const response = query({
        prompt: '请只回复"OK"两个字。',
        options: {
          model: entry.model,
          allowedTools: [],
          permissionMode: 'bypassPermissions',
          env: this.buildEnv(settings),
        },
      })
      let text = ''
      for await (const message of response as AsyncIterable<any>) {
        if (message.type === 'assistant') {
          const blocks = message.message?.content ?? []
          text = blocks
            .filter((b: any) => b?.type === 'text')
            .map((b: any) => b.text ?? '')
            .join('')
        } else if (message.type === 'result' && message.subtype === 'success') {
          if (typeof message.result === 'string') text = message.result
        }
      }
      return { ok: true, message: `连接成功，模型响应: ${text.trim().slice(0, 40)}` }
    } catch (err: any) {
      return { ok: false, message: `连接失败: ${err?.message ?? String(err)}` }
    }
  }
}
