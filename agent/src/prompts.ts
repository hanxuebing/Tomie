import type { AgentInput } from './types'

export function buildSystemPrompt(hasMultipleSources: boolean): string {
  const desc = '你是一位专业的文章写作专家。你的任务是根据用户提供的参考文章和具体要求，创作或改写一篇高质量的文章。'

  const multi = hasMultipleSources
    ? '\n\n用户提供了多篇参考文章，请综合学习它们的共同风格特征和优秀之处，融合后产出一篇高质量文章。'
    : ''

  return `${desc}${multi}

要求：
1. 输出格式为 Markdown
2. 保持专业水准，语言流畅自然
3. 文章结构清晰，有合理的标题层级
4. 不要在文章中提及"仿写"、"改写"等字眼
5. 直接输出文章内容，不要包含任何解释或说明`
}

export function buildUserPrompt(input: AgentInput): string {
  const multi = input.sources.length > 1
  const sourcesText = input.sources
    .map((c, i) => {
      const label = multi ? `【参考文章 ${i + 1}】` : '【参考文章】'
      return `${label}\n${c}`
    })
    .join('\n\n---\n\n')

  if (input.previousDraft) {
    return `以下是参考文章：\n\n${sourcesText}\n\n---\n\n这是当前草稿：\n\n${input.previousDraft}\n\n---\n\n请根据以下要求修改上面的草稿，并输出修改后的完整文章：\n\n${input.prompt}`
  }

  const instruction = `请根据以上参考文章，按照以下要求创作文章：\n\n${input.prompt}`

  return `以下是参考文章：\n\n${sourcesText}\n\n---\n\n${instruction}`
}
