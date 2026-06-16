import { query } from '@anthropic-ai/claude-agent-sdk'
import type { VisionEngine, VisionInput, LLMSettings } from '../types'
import { pickModel } from '../types'

export class ClaudeVisionEngine implements VisionEngine {
  readonly name = 'claude-vision'

  private buildEnv(settings: LLMSettings): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string') env[k] = v
    }
    env.ANTHROPIC_AUTH_TOKEN = settings.auth.authToken
    if (settings.auth.baseUrl) env.ANTHROPIC_BASE_URL = settings.auth.baseUrl
    return env
  }

  async recognize(
    input: VisionInput,
    settings: LLMSettings,
    signal?: AbortSignal,
  ): Promise<string> {
    const entry = pickModel(settings, 'vision')
    if (!entry) throw new Error('未配置多模态模型，请在设置中添加 vision 模型')

    // Use the Claude Agent SDK query() with a prompt that contains the image
    // The SDK supports image content blocks via the Anthropic Messages API format
    const imagePrompt = `请将这张图片中的所有文字原封不动地转录出来。

要求：
1. 逐字完整还原图片中的文字，不得增删、改写或重新排版
2. 保留原文的换行与段落顺序
3. 不要主动添加 Markdown 标题、列表等格式标记
4. 直接输出识别到的文字，不要添加任何额外说明

${input.hint ? `补充说明：${input.hint}` : ''}`

    const ac = signal ? (() => {
      const c = new AbortController()
      if (signal.aborted) c.abort()
      else signal.addEventListener('abort', () => c.abort(), { once: true })
      return c
    })() : undefined

    // Build custom messages with image content block
    // The Claude Agent SDK query() takes a prompt string; for images we need
    // to pass a structured content block. We'll encode the image inline.
    const promptWithImage = `<image>data:${input.mimeType};base64,${input.imageBase64}</image>\n\n${imagePrompt}`

    const response = query({
      prompt: promptWithImage,
      options: {
        model: entry.model,
        systemPrompt: '你是一个专业的 OCR 文字转录助手。你的任务是将图片中的文字原封不动地转录出来，不做任何改写或格式化。',
        allowedTools: [],
        permissionMode: 'bypassPermissions',
        env: this.buildEnv(settings),
        abortController: ac,
      },
    })

    let text = ''
    for await (const message of response as AsyncIterable<any>) {
      if (signal?.aborted) break
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

    if (!text) throw new Error('图片识别未返回内容')
    return text
  }
}
