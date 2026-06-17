import { ref } from 'vue'

export function useCopyContent(getContent: () => string) {
  const copyTextSuccess = ref(false)
  const copyMdSuccess = ref(false)
  let copyTextTimer: number | null = null
  let copyMdTimer: number | null = null

  async function copyAsPlainText() {
    const md = getContent()
    if (!md) return
    try {
      const plain = md
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .replace(/^[-*+]\s+/gm, '')
        .replace(/^>\s+/gm, '')
        .replace(/\n{3,}/g, '\n\n')
      await navigator.clipboard.writeText(plain.trim())
      copyTextSuccess.value = true
      if (copyTextTimer) clearTimeout(copyTextTimer)
      copyTextTimer = window.setTimeout(() => { copyTextSuccess.value = false }, 2000)
    } catch {
      window.alert('复制失败')
    }
  }

  async function copyAsMarkdown() {
    const md = getContent()
    if (!md) return
    try {
      await navigator.clipboard.writeText(md)
      copyMdSuccess.value = true
      if (copyMdTimer) clearTimeout(copyMdTimer)
      copyMdTimer = window.setTimeout(() => { copyMdSuccess.value = false }, 2000)
    } catch {
      window.alert('复制失败')
    }
  }

  return { copyTextSuccess, copyMdSuccess, copyAsPlainText, copyAsMarkdown }
}
