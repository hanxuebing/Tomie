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

// Source articles collapsible
const sourcesExpanded = ref(true)

// Generation input
const genPrompt = ref('')
const basedOn = ref<'source' | 'previous'>('source')

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
let eventSource: EventSource | null = null

const latestGeneration = computed<GenerationItem | null>(() => {
  if (!task.value || !task.value.generations.length) return null
  return task.value.generations[task.value.generations.length - 1]
})

const isRunning = computed(() => task.value?.is_running ?? false)

const hasGenerations = computed(() => (task.value?.generations.length ?? 0) > 0)

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
  await loadArticleContent(gen.article_id)
}

async function doRegenerate(gen: GenerationItem) {
  if (isStreaming.value) return
  streamingContent.value = ''
  isStreaming.value = true

  try {
    const payload: Record<string, unknown> = {
      prompt: gen.prompt,
      based_on: gen.based_on,
    }
    if (gen.based_on === 'previous' && gen.parent_generation_id) {
      payload.parent_generation_id = gen.parent_generation_id
    }
    if (selectedModelId.value) payload.model_id = selectedModelId.value
    startSSE()
    await api.post(`/tasks/${taskId}/generate`, payload)
  } catch {
    closeSSE()
    window.alert('重新生成请求失败')
    isStreaming.value = false
  }
}

async function doGenerate() {
  if (isStreaming.value || !genPrompt.value.trim()) return
  streamingContent.value = ''
  isStreaming.value = true

  try {
    const payload: Record<string, unknown> = {
      prompt: genPrompt.value.trim(),
      based_on: basedOn.value,
    }
    if (basedOn.value === 'previous' && latestGeneration.value) {
      payload.parent_generation_id = latestGeneration.value.id
    }
    if (selectedModelId.value) payload.model_id = selectedModelId.value
    // Open the SSE stream before triggering generation so no early chunks are missed.
    startSSE()
    await api.post(`/tasks/${taskId}/generate`, payload)
    genPrompt.value = ''
  } catch {
    closeSSE()
    window.alert('生成请求失败，请稍后重试')
    isStreaming.value = false
  }
}

function startSSE() {
  closeSSE()
  const url = `/api/tasks/${taskId}/stream`
  eventSource = new EventSource(url)

  eventSource.addEventListener('chunk', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      streamingContent.value += data.content ?? ''
    } catch {
      streamingContent.value += e.data
    }
  })

  eventSource.addEventListener('done', () => {
    closeSSE()
    isStreaming.value = false
    fetchTask()
  })

  eventSource.addEventListener('error', (e: MessageEvent) => {
    closeSSE()
    isStreaming.value = false
    try {
      const data = JSON.parse(e.data)
      window.alert(`生成出错：${data.message || '未知错误'}`)
    } catch {
      window.alert(`生成出错：${e.data || '未知错误'}`)
    }
    fetchTask()
  })

  eventSource.addEventListener('cancelled', () => {
    closeSSE()
    isStreaming.value = false
    window.alert('生成已取消')
    fetchTask()
  })

  eventSource.onerror = () => {
    closeSSE()
    isStreaming.value = false
  }
}

function closeSSE() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
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

onMounted(() => {
  fetchTask()
  fetchTextModels()
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
                :generations="task.generations"
                :can-regenerate="task.status === 'running' && !isStreaming"
                @view="viewGenerationArticle"
                @select="selectGeneration"
                @regenerate="doRegenerate"
              />
              <p v-if="!task.generations.length" class="py-2 text-center text-xs text-text-muted">
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
              </div>
              <MarkdownViewer :content="streamingContent || '等待内容…'" />
            </div>

            <!-- Latest content -->
            <div v-else-if="displayContent">
              <h2 v-if="displayTitle" class="mb-4 text-xl font-bold text-text">
                {{ displayTitle }}
              </h2>
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
            <div class="mb-3 flex items-center gap-4">
              <label class="flex items-center gap-1.5 text-sm text-text-secondary">
                <input
                  v-model="basedOn"
                  type="radio"
                  value="source"
                  class="accent-primary"
                />
                基于原始文章
              </label>
              <label
                class="flex items-center gap-1.5 text-sm"
                :class="hasGenerations ? 'text-text-secondary' : 'text-text-muted'"
              >
                <input
                  v-model="basedOn"
                  type="radio"
                  value="previous"
                  :disabled="!hasGenerations"
                  class="accent-primary"
                />
                基于上次生成
              </label>
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
