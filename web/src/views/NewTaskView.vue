<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api, { ocrImage, getLLMConfig } from '@/api'
import type { Article, LLMModel } from '@/types'
import ArticleSelector from '@/components/ArticleSelector.vue'

const router = useRouter()
const route = useRoute()

// Stepper
const step = ref(1)
const totalSteps = 2

// Step 1 — Source articles
const selectedIds = ref<string[]>([])
const selectedArticles = ref<Article[]>([])
const selectorVisible = ref(false)
const quickAddTitle = ref('')
const quickAddContent = ref('')
const quickAddLoading = ref(false)

// OCR — image → markdown (non-blocking)
const ocrInput = ref<HTMLInputElement | null>(null)
const ocrPending = ref(false)
let ocrPromise: Promise<void> | null = null

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip the "data:<mime>;base64," prefix
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function onOcrFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!quickAddTitle.value.trim()) {
    quickAddTitle.value = file.name.replace(/\.[^.]+$/, '')
  }

  ocrPending.value = true
  ocrPromise = (async () => {
    try {
      const base64 = await readFileAsBase64(file)
      const { markdown } = await ocrImage({ image: base64, mimeType: file.type })
      quickAddContent.value = quickAddContent.value
        ? `${quickAddContent.value}\n\n${markdown}`
        : markdown
    } catch (err: any) {
      window.alert(`图片识别失败：${err?.response?.data?.error || err?.message || '未知错误'}`)
    } finally {
      ocrPending.value = false
      ocrPromise = null
    }
  })()

  input.value = ''
}

// Step 2 — Config
const title = ref('')
const prompt = ref('')
const submitting = ref(false)

// Model selection
const textModels = ref<LLMModel[]>([])
const selectedModelId = ref('')

async function fetchTextModels() {
  try {
    const data = await getLLMConfig()
    textModels.value = data.models.filter((m) => m.role === 'text')
    // Pre-select the default
    const defaultModel = textModels.value.find((m) => m.is_default === 1)
    selectedModelId.value = defaultModel?.id ?? textModels.value[0]?.id ?? ''
  } catch {
    // OK — settings may not be configured yet
  }
}

const canNext = computed(() => {
  if (step.value === 1) return selectedIds.value.length > 0 || ocrPending.value || quickAddContent.value.trim() !== ''
  if (step.value === 2) return title.value.trim() !== '' && prompt.value.trim() !== ''
  return false
})

// Pre-select from query
onMounted(async () => {
  fetchTextModels()
  const preId = route.query.source_article as string | undefined
  if (preId) {
    try {
      const res = await api.get<Article>(`/articles/${preId}`)
      selectedIds.value = [res.data.id]
      selectedArticles.value = [res.data]
    } catch {
      // ignore
    }
  }
})

function onSelectorConfirm(ids: string[]) {
  selectorVisible.value = false
  // fetch selected articles to display
  fetchSelectedArticles(ids)
}

async function fetchSelectedArticles(ids: string[]) {
  selectedIds.value = ids
  const results: Article[] = []
  for (const id of ids) {
    try {
      const res = await api.get<Article>(`/articles/${id}`)
      results.push(res.data)
    } catch {
      // skip failed
    }
  }
  selectedArticles.value = results
}

async function quickAdd() {
  if (!quickAddTitle.value.trim() || !quickAddContent.value.trim()) {
    window.alert('请填写标题和内容')
    return
  }
  quickAddLoading.value = true
  try {
    const res = await api.post<Article>('/articles', {
      title: quickAddTitle.value.trim(),
      content: quickAddContent.value.trim(),
    })
    const article = res.data
    selectedIds.value = [...selectedIds.value, article.id]
    selectedArticles.value = [...selectedArticles.value, article]
    quickAddTitle.value = ''
    quickAddContent.value = ''
  } catch {
    window.alert('创建文章失败，请稍后重试')
  } finally {
    quickAddLoading.value = false
  }
}

function removeSelected(id: string) {
  selectedIds.value = selectedIds.value.filter((i) => i !== id)
  selectedArticles.value = selectedArticles.value.filter((a) => a.id !== id)
}

function nextStep() {
  if (step.value < totalSteps) step.value++
}

function prevStep() {
  if (step.value > 1) step.value--
}

async function submit() {
  if (submitting.value) return
  submitting.value = true
  try {
    // Wait for OCR if still pending
    if (ocrPromise) await ocrPromise

    // Auto-save quick-add content as article if not yet saved
    if (quickAddContent.value.trim() && quickAddTitle.value.trim()) {
      const res = await api.post<Article>('/articles', {
        title: quickAddTitle.value.trim(),
        content: quickAddContent.value.trim(),
      })
      const article = res.data
      selectedIds.value = [...selectedIds.value, article.id]
      selectedArticles.value = [...selectedArticles.value, article]
      quickAddTitle.value = ''
      quickAddContent.value = ''
    }

    if (selectedIds.value.length === 0) {
      window.alert('请至少添加一篇源文章')
      return
    }

    const res = await api.post<{ id: string }>('/tasks', {
      title: title.value.trim(),
      initial_prompt: prompt.value.trim(),
      source_article_ids: selectedIds.value,
    })
    const taskId = res.data.id
    await api.post(`/tasks/${taskId}/generate`, {
      prompt: prompt.value.trim(),
      based_on: 'source',
      model_id: selectedModelId.value || undefined,
    })
    router.push(`/tasks/${taskId}`)
  } catch {
    window.alert('创建任务失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-8 py-6">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold text-text">新建任务</h1>
      <router-link to="/tasks" class="text-sm text-text-secondary hover:text-text">
        ← 返回
      </router-link>
    </div>

    <!-- Step indicator -->
    <div class="mb-8 flex items-center gap-2">
      <template v-for="s in totalSteps" :key="s">
        <div
          class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors"
          :class="
            s <= step
              ? 'bg-primary text-white'
              : 'bg-slate-100 text-text-muted'
          "
        >
          {{ s }}
        </div>
        <div
          v-if="s < totalSteps"
          class="h-0.5 flex-1 rounded-full transition-colors"
          :class="s < step ? 'bg-primary' : 'bg-border'"
        />
      </template>
    </div>

    <!-- Step 1: Source articles -->
    <div v-show="step === 1">
      <h2 class="mb-4 text-lg font-semibold text-text">选择源文章</h2>

      <button
        type="button"
        class="mb-4 rounded-lg border border-dashed border-primary bg-primary-light px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-indigo-100"
        @click="selectorVisible = true"
      >
        📚 从文章库选择
      </button>

      <!-- Selected articles -->
      <div v-if="selectedArticles.length" class="mb-6 space-y-2">
        <p class="text-xs font-medium text-text-secondary">已选 {{ selectedArticles.length }} 篇</p>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="article in selectedArticles"
            :key="article.id"
            class="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
          >
            <span class="max-w-[200px] truncate text-text">{{ article.title }}</span>
            <button
              type="button"
              class="text-text-muted hover:text-danger"
              @click="removeSelected(article.id)"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <!-- Quick add -->
      <div class="rounded-xl border border-border bg-card p-4">
        <p class="mb-3 text-sm font-medium text-text">快速添加新文章</p>
        <input
          v-model="quickAddTitle"
          type="text"
          placeholder="文章标题"
          class="mb-3 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        <textarea
          v-model="quickAddContent"
          placeholder="粘贴文章内容（Markdown）"
          rows="6"
          class="mb-3 w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        <div class="flex items-center gap-3">
          <button
            type="button"
            :disabled="quickAddLoading"
            class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            @click="quickAdd"
          >
            {{ quickAddLoading ? '添加中…' : '创建并选择' }}
          </button>
          <input ref="ocrInput" type="file" accept="image/*" class="hidden" @change="onOcrFile" />
          <button
            type="button"
            :disabled="ocrPending"
            class="rounded-lg border border-dashed border-primary bg-primary-light px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-indigo-100 disabled:opacity-50"
            @click="ocrInput?.click()"
          >
            {{ ocrPending ? '识别中…' : '📷 上传图片识别' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Step 2: Config -->
    <div v-show="step === 2">
      <h2 class="mb-4 text-lg font-semibold text-text">配置任务</h2>
      <p v-if="ocrPending" class="mb-4 text-sm text-primary">
        图片识别中，将自动填入文章内容…
      </p>
      <div class="space-y-4">
        <div>
          <label class="mb-1.5 block text-sm font-medium text-text">任务标题</label>
          <input
            v-model="title"
            type="text"
            placeholder="为任务起个名字"
            class="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </div>
        <div v-if="textModels.length">
          <label class="mb-1.5 block text-sm font-medium text-text">生成模型</label>
          <select
            v-model="selectedModelId"
            class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none focus:border-primary"
          >
            <option v-for="m in textModels" :key="m.id" :value="m.id">
              {{ m.name }}{{ m.is_default === 1 ? '（默认）' : '' }}
            </option>
          </select>
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium text-text">初始提示词</label>
          <textarea
            v-model="prompt"
            placeholder="描述你希望如何生成文章…"
            rows="8"
            class="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </div>
      </div>
    </div>

    <!-- Navigation buttons -->
    <div class="mt-8 flex items-center justify-between border-t border-border pt-6">
      <button
        v-if="step > 1"
        type="button"
        class="rounded-lg border border-border bg-card px-5 py-2 text-sm font-medium text-text transition-colors hover:bg-slate-50"
        @click="prevStep"
      >
        ← 上一步
      </button>
      <span v-else />

      <button
        v-if="step < totalSteps"
        type="button"
        :disabled="!canNext"
        class="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        @click="nextStep"
      >
        下一步 →
      </button>
      <button
        v-else
        type="button"
        :disabled="!canNext || submitting"
        class="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        @click="submit"
      >
        {{ ocrPending ? '识别中…' : submitting ? '创建中…' : '创建并开始' }}
      </button>
    </div>

    <!-- Article Selector Dialog -->
    <ArticleSelector
      :visible="selectorVisible"
      :selectedIds="selectedIds"
      multiple
      @update:visible="selectorVisible = $event"
      @update:selectedIds="selectedIds = $event"
      @confirm="onSelectorConfirm"
    />
  </div>
</template>
