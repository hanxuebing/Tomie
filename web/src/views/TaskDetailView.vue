<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api, { getLLMConfig } from '@/api'
import type { TaskDetail, GenerationItem, Article, LLMModel } from '@/types'
import MarkdownViewer from '@/components/MarkdownViewer.vue'
import GenerationHistory from '@/components/GenerationHistory.vue'

const route = useRoute()
const router = useRouter()
const taskId = route.params.id as string

const task = ref<TaskDetail | null>(null)
const loading = ref(true)
const error = ref('')

// Content display
const displayContent = ref('')
const displayTitle = ref('')
const streamingContent = ref('')
const isStreaming = ref(false)

// Copy
const copyTextSuccess = ref(false)
const copyMdSuccess = ref(false)
let copyTextTimer: number | null = null
let copyMdTimer: number | null = null

function getContentText(): string {
  return isStreaming.value ? streamingContent.value : displayContent.value
}

async function copyAsPlainText() {
  const md = getContentText()
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
  const md = getContentText()
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

// Source articles collapsible
const sourcesExpanded = ref(true)

// Generation input
const genPrompt = ref('')
const selectedBase = ref<GenerationItem | null>(null)
const selectedGenId = ref<string | null>(null)

const baseLabel = computed(() =>
  selectedBase.value ? `#${selectedBase.value.sequence_num}` : '源文章'
)

// In-progress placeholder shown in the history timeline while generating
const PENDING_ID = '__pending__'
const pendingGen = ref<GenerationItem | null>(null)

const displayGenerations = computed<GenerationItem[]>(() => {
  const list = task.value?.generations ?? []
  const p = pendingGen.value
  if (!p) return list
  if (list.some((g) => g.sequence_num === p.sequence_num)) {
    return list.map((g) => (g.sequence_num === p.sequence_num ? p : g))
  }
  return [...list, p]
})

function makePending(opts: {
  prompt: string
  based_on: 'source' | 'previous'
  sequence_num: number
  parent_sequence_num: number | null
}): GenerationItem {
  return {
    id: PENDING_ID,
    task_id: taskId,
    article_id: '',
    prompt: opts.prompt,
    based_on: opts.based_on,
    parent_generation_id: null,
    sequence_num: opts.sequence_num,
    created_at: new Date().toISOString(),
    replaced_by: null,
    article_title: '生成中…',
    file_path: '',
    file_found: false,
    parent_sequence_num: opts.parent_sequence_num,
    pending: true,
  }
}

// Model selection
const textModels = ref<LLMModel[]>([])
const selectedModelId = ref('')

async function fetchTextModels() {
  try {
    const data = await getLLMConfig()
    textModels.value = data.models.filter((m) => m.role === 'text')
    const defaultModel = textModels.value.find((m) => m.is_default === 1)
    selectedModelId.value = defaultModel?.id ?? textModels.value[0]?.id ?? ''
  } catch {
    // settings may not be configured yet
  }
}

// SSE
let sseAbort: AbortController | null = null
let sseReconnectTimer: number | null = null
let sseRetries = 0
const SSE_MAX_RETRIES = 6
const SSE_BASE_DELAY = 1000
const SSE_MAX_DELAY = 15000

const isRunning = computed(() => task.value?.status === 'running')

const isGenerating = computed(() => isStreaming.value || (task.value?.is_running ?? false))
const statusLabel = computed(() => {
  if (task.value?.status === 'running') return isGenerating.value ? '生成中' : '空闲'
  const m: Record<string, string> = { completed: '已完成', cancelled: '已取消' }
  return m[task.value?.status ?? ''] ?? ''
})
const statusCls = computed(() => {
  if (task.value?.status === 'running') {
    return isGenerating.value ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-text-muted'
  }
  const m: Record<string, string> = { completed: 'bg-slate-100 text-slate-600', cancelled: 'bg-slate-100 text-text-muted' }
  return m[task.value?.status ?? ''] ?? ''
})

async function fetchTask() {
  try {
    const res = await api.get<TaskDetail>(`/tasks/${taskId}`)
    task.value = res.data
    // Rebuild the pending placeholder from server state when generation is in-progress
    if (res.data.is_running && res.data.running_generation) {
      const rg = res.data.running_generation
      pendingGen.value = makePending({
        prompt: rg.prompt,
        based_on: rg.based_on,
        sequence_num: rg.sequence_num,
        parent_sequence_num: rg.parent_sequence_num,
      })
    } else {
      pendingGen.value = null
    }
    // Keep the selected base pointing at the current slot (ids change on replace)
    if (selectedBase.value) {
      selectedBase.value =
        res.data.generations.find(g => g.sequence_num === selectedBase.value!.sequence_num) ?? null
    }
    // Load latest generation article content
    if (!isStreaming.value && res.data.generations.length) {
      const latest = res.data.generations[res.data.generations.length - 1]
      await loadArticleContent(latest.article_id)
    }
  } catch {
    error.value = '加载任务详情失败'
  } finally {
    loading.value = false
  }
}

async function loadArticleContent(articleId: string) {
  try {
    const res = await api.get<Article>(`/articles/${articleId}`)
    if (res.data.found === false) {
      displayContent.value = ''
      displayTitle.value = '文章未找到'
      return
    }
    displayContent.value = res.data.content ?? ''
    displayTitle.value = res.data.title
  } catch {
    displayContent.value = ''
    displayTitle.value = '文章加载失败'
  }
}

function viewGenerationArticle(articleId: string) {
  router.push(`/articles/${articleId}`)
}

async function selectGeneration(gen: GenerationItem) {
  selectedGenId.value = gen.id
  selectedBase.value = gen
  await loadArticleContent(gen.article_id)
}

function resetBase() {
  selectedBase.value = null
  selectedGenId.value = null
}

async function doRegenerate(gen: GenerationItem) {
  if (isStreaming.value) return
  streamingContent.value = ''
  isStreaming.value = true

  // Insert pending placeholder at the same slot
  pendingGen.value = makePending({
    prompt: gen.prompt,
    based_on: gen.based_on,
    sequence_num: gen.sequence_num,
    parent_sequence_num: gen.parent_sequence_num ?? null,
  })

  try {
    const payload: Record<string, unknown> = {
      prompt: gen.prompt,
      based_on: gen.based_on,
      replace_generation_id: gen.id,
    }
    if (gen.based_on === 'previous' && gen.parent_generation_id) {
      payload.parent_generation_id = gen.parent_generation_id
    }
    if (selectedModelId.value) payload.model_id = selectedModelId.value
    startSSE()
    await api.post(`/tasks/${taskId}/generate`, payload)
  } catch {
    closeSSE()
    pendingGen.value = null
    window.alert('重新生成请求失败')
    isStreaming.value = false
  }
}

async function doGenerate() {
  if (isStreaming.value || !genPrompt.value.trim()) return
  streamingContent.value = ''
  isStreaming.value = true

  const prompt = genPrompt.value.trim()
  const basedOn: 'source' | 'previous' = selectedBase.value ? 'previous' : 'source'
  const parentSeqNum = selectedBase.value?.sequence_num ?? null

  // Calculate next sequence_num
  const gens = task.value?.generations ?? []
  const maxSeq = gens.length ? Math.max(...gens.map((g) => g.sequence_num)) : 0

  // Insert pending placeholder
  pendingGen.value = makePending({
    prompt,
    based_on: basedOn,
    sequence_num: maxSeq + 1,
    parent_sequence_num: parentSeqNum,
  })

  try {
    const payload: Record<string, unknown> = {
      prompt,
      based_on: basedOn,
    }
    if (selectedBase.value) {
      payload.parent_generation_id = selectedBase.value.id
    }
    if (selectedModelId.value) payload.model_id = selectedModelId.value
    // Open the SSE stream before triggering generation so no early chunks are missed.
    startSSE()
    await api.post(`/tasks/${taskId}/generate`, payload)
    genPrompt.value = ''
  } catch {
    closeSSE()
    pendingGen.value = null
    window.alert('生成请求失败，请稍后重试')
    isStreaming.value = false
  }
}

function startSSE() {
  closeSSE()
  sseRetries = 0
  connectSSE()
}

function connectSSE() {
  const ctrl = new AbortController()
  sseAbort = ctrl

  const baseURL = api.defaults.baseURL || ''
  const url = `${baseURL}/tasks/${taskId}/stream`
  const headers: Record<string, string> = { Accept: 'text/event-stream' }
  const axiosAuth = api.defaults.headers?.common?.['Authorization']
  if (axiosAuth && typeof axiosAuth === 'string') headers['Authorization'] = axiosAuth

  ;(async () => {
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal })
      if (!res.ok || !res.body) {
        scheduleReconnect(ctrl)
        return
      }

      // 成功建立连接，重置退避计数
      sseRetries = 0

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        let boundary: number
        while ((boundary = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, boundary)
          buf = buf.slice(boundary + 2)

          let event = 'message'
          let data = ''
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) data = line.slice(5).trim()
          }

          handleSSEEvent(event, data)
        }
      }

      // 流结束但未收到终止事件（服务端关闭连接 / 网络中断）→ 尝试重连
      scheduleReconnect(ctrl)
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      scheduleReconnect(ctrl)
    }
  })()
}

// 非正常断开时按指数退避重连；重连前先核对 is_running，生成已结束则收尾
function scheduleReconnect(ctrl: AbortController) {
  // 已被 closeSSE 中止或被新连接取代，则不再重连
  if (sseAbort !== ctrl) return
  sseAbort = null
  if (!isStreaming.value) return

  if (sseRetries >= SSE_MAX_RETRIES) {
    isStreaming.value = false
    fetchTask()
    return
  }

  const delay = Math.min(SSE_BASE_DELAY * 2 ** sseRetries, SSE_MAX_DELAY)
  sseRetries++
  sseReconnectTimer = window.setTimeout(async () => {
    sseReconnectTimer = null
    if (!isStreaming.value) return
    try {
      const res = await api.get<TaskDetail>(`/tasks/${taskId}`)
      if (!res.data.is_running) {
        isStreaming.value = false
        await fetchTask()
        return
      }
    } catch {
      // 核对失败（可能网络仍未恢复）→ 仍尝试重连
    }
    if (isStreaming.value) connectSSE()
  }, delay)
}

function handleSSEEvent(event: string, data: string) {
  switch (event) {
    case 'connected':
      if (isStreaming.value && streamingContent.value === '') {
        api.get<TaskDetail>(`/tasks/${taskId}`)
          .then(res => {
            if (!res.data.is_running) {
              closeSSE()
              isStreaming.value = false
              fetchTask()
            }
          })
          .catch(() => {})
      }
      break
    case 'chunk':
      try {
        const parsed = JSON.parse(data)
        streamingContent.value += parsed.content ?? ''
      } catch {
        streamingContent.value += data
      }
      break
    case 'done':
      closeSSE()
      isStreaming.value = false
      fetchTask()
      break
    case 'error':
      closeSSE()
      isStreaming.value = false
      try {
        const parsed = JSON.parse(data)
        window.alert(`生成出错：${parsed.message || '未知错误'}`)
      } catch {
        window.alert(`生成出错：${data || '未知错误'}`)
      }
      fetchTask()
      break
    case 'cancelled':
      closeSSE()
      isStreaming.value = false
      window.alert('生成已取消')
      fetchTask()
      break
  }
}

function closeSSE() {
  if (sseReconnectTimer !== null) {
    clearTimeout(sseReconnectTimer)
    sseReconnectTimer = null
  }
  if (sseAbort) {
    sseAbort.abort()
    sseAbort = null
  }
  sseRetries = 0
}

async function finishTask() {
  if (!window.confirm('确定将任务标记为完成？')) return
  try {
    await api.put(`/tasks/${taskId}/complete`)
    await fetchTask()
  } catch {
    window.alert('操作失败')
  }
}

async function cancelTask() {
  if (!window.confirm('确定取消任务？')) return
  try {
    await api.put(`/tasks/${taskId}/cancel`)
    await fetchTask()
  } catch {
    window.alert('操作失败')
  }
}

onMounted(async () => {
  fetchTextModels()
  await fetchTask()

  if (task.value?.is_running && !isStreaming.value) {
    streamingContent.value = ''
    isStreaming.value = true
    startSSE()
  }
})

onUnmounted(() => {
  closeSSE()
})
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Loading / Error -->
    <div v-if="loading" class="flex flex-1 items-center justify-center text-text-muted">
      加载中…
    </div>
    <div v-else-if="error" class="flex flex-1 items-center justify-center text-danger">
      {{ error }}
    </div>

    <template v-else-if="task">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-border px-6 py-4">
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="text-sm text-text-secondary hover:text-text"
            @click="router.push('/tasks')"
          >
            ← 返回
          </button>
          <h1 class="text-lg font-bold text-text">{{ task.title }}</h1>
          <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="statusCls">
            {{ statusLabel }}
          </span>
        </div>
        <div v-if="isRunning" class="flex items-center gap-2">
          <template v-if="!isStreaming">
            <button
              type="button"
              class="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-slate-50"
              @click="finishTask"
            >
              ✓ 完成
            </button>
          </template>
          <button
            type="button"
            class="rounded-lg border border-red-200 bg-card px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-red-50"
            @click="cancelTask"
          >
            ✕ 取消
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Left panel (1/3) -->
        <div class="flex w-1/3 flex-col border-r border-border">
          <div class="flex-1 overflow-y-auto p-4">
            <!-- Sources -->
            <div class="mb-4">
              <button
                type="button"
                class="flex w-full items-center justify-between text-sm font-semibold text-text"
                @click="sourcesExpanded = !sourcesExpanded"
              >
                <span>源文章 ({{ task.sources.length }})</span>
                <span class="text-text-muted">{{ sourcesExpanded ? '▾' : '▸' }}</span>
              </button>
              <div v-if="sourcesExpanded" class="mt-2 space-y-1.5">
                <div
                  v-for="src in task.sources"
                  :key="src.id"
                  class="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-slate-50"
                >
                  <span
                    class="flex-1 truncate"
                    :class="src.file_found ? 'text-text cursor-pointer hover:text-primary' : 'text-text-muted line-through'"
                    @click="src.file_found && router.push(`/articles/${src.article_id}`)"
                  >
                    {{ src.title }}
                  </span>
                  <span v-if="!src.file_found" class="shrink-0 text-xs text-warning">未找到</span>
                </div>
                <p v-if="!task.sources.length" class="py-2 text-center text-xs text-text-muted">
                  暂无源文章
                </p>
              </div>
            </div>

            <!-- Generations -->
            <div>
              <p class="mb-2 text-sm font-semibold text-text">生成历史</p>
              <GenerationHistory
                :generations="displayGenerations"
                :can-regenerate="task.status === 'running' && !isStreaming"
                :selected-id="selectedGenId"
                @view="viewGenerationArticle"
                @select="selectGeneration"
                @regenerate="doRegenerate"
              />
              <p v-if="!displayGenerations.length" class="py-2 text-center text-xs text-text-muted">
                暂无生成记录
              </p>
            </div>
          </div>
        </div>

        <!-- Right panel (2/3) -->
        <div class="flex w-2/3 flex-col">
          <!-- Content area -->
          <div class="flex-1 overflow-y-auto p-6">
            <!-- Streaming -->
            <div v-if="isStreaming">
              <div class="mb-3 flex items-center gap-2">
                <span class="relative flex h-2.5 w-2.5">
                  <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                <span class="text-sm font-medium text-primary">正在生成…</span>
                <button
                  v-if="streamingContent"
                  type="button"
                  class="ml-auto rounded-md border border-border px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-slate-50"
                  @click="copyAsPlainText"
                >
                  {{ copyTextSuccess ? '已复制' : '复制文本' }}
                </button>
                <button
                  v-if="streamingContent"
                  type="button"
                  class="rounded-md border border-border px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-slate-50"
                  @click="copyAsMarkdown"
                >
                  {{ copyMdSuccess ? '已复制' : '复制 MD' }}
                </button>
              </div>
              <MarkdownViewer :content="streamingContent || '等待内容…'" />
            </div>

            <!-- Latest content -->
            <div v-else-if="displayContent">
              <div class="mb-4 flex items-start justify-between gap-3">
                <h2 v-if="displayTitle" class="text-xl font-bold text-text">
                  {{ displayTitle }}
                </h2>
                <div class="ml-auto flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    class="rounded-md border border-border px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-slate-50"
                    @click="copyAsPlainText"
                  >
                    {{ copyTextSuccess ? '已复制' : '复制文本' }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-border px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-slate-50"
                    @click="copyAsMarkdown"
                  >
                    {{ copyMdSuccess ? '已复制' : '复制 MD' }}
                  </button>
                </div>
              </div>
              <MarkdownViewer :content="displayContent" />
            </div>

            <!-- Empty -->
            <div v-else class="flex h-full items-center justify-center">
              <div class="text-center">
                <div class="mb-3 text-4xl">📝</div>
                <p class="text-sm text-text-muted">暂无生成内容</p>
                <p v-if="isRunning" class="mt-1 text-xs text-text-muted">
                  在下方输入提示词开始生成
                </p>
              </div>
            </div>
          </div>

          <!-- Bottom bar — generation input (running only) -->
          <div v-if="isRunning" class="border-t border-border bg-card p-4">
            <div class="mb-3 flex items-center gap-3">
              <span class="text-sm text-text-secondary">
                当前基于：<span class="font-medium text-text">{{ baseLabel }}</span>
              </span>
              <button
                v-if="selectedBase"
                type="button"
                class="rounded-md border border-border px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-slate-50"
                @click="resetBase"
              >
                重置为源文章
              </button>
              <select
                v-if="textModels.length"
                v-model="selectedModelId"
                class="ml-auto rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-primary"
              >
                <option v-for="m in textModels" :key="m.id" :value="m.id">
                  {{ m.name }}{{ m.is_default === 1 ? '（默认）' : '' }}
                </option>
              </select>
            </div>
            <div class="flex gap-3">
              <textarea
                v-model="genPrompt"
                placeholder="输入提示词…"
                rows="2"
                class="flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
                @keydown.ctrl.enter="doGenerate"
              />
              <button
                type="button"
                :disabled="isStreaming || !genPrompt.trim()"
                class="shrink-0 self-end rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                @click="doGenerate"
              >
                {{ isStreaming ? '生成中…' : '生成' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
