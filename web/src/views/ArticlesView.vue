<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { listGroupedArticles, ocrImage } from '@/api'
import api from '@/api'
import type { Article, GroupedArticles } from '@/types'
import ArticleCard from '@/components/ArticleCard.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'

const router = useRouter()

const grouped = ref<GroupedArticles>({
  ungrouped: [],
  tasks: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
})
const loading = ref(false)
const error = ref('')
const search = ref('')
const currentPage = ref(1)

// Collapsible task groups
const collapsedTasks = ref<Set<string>>(new Set())

function toggleTaskCollapse(taskId: string) {
  const s = new Set(collapsedTasks.value)
  if (s.has(taskId)) s.delete(taskId)
  else s.add(taskId)
  collapsedTasks.value = s
}

const pagination = computed(() => grouped.value.pagination)
const hasAnyContent = computed(() => grouped.value.ungrouped.length > 0 || grouped.value.tasks.length > 0)

// Upload dialog
const showUpload = ref(false)
const uploadTitle = ref('')
const uploadContent = ref('')
const saving = ref(false)

// OCR
const ocrInput = ref<HTMLInputElement | null>(null)
const ocrLoading = ref(false)

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function onOcrFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  ocrLoading.value = true
  try {
    const base64 = await readFileAsBase64(file)
    const { markdown } = await ocrImage({ image: base64, mimeType: file.type })
    if (!uploadTitle.value.trim()) {
      uploadTitle.value = file.name.replace(/\.[^.]+$/, '')
    }
    uploadContent.value = uploadContent.value
      ? `${uploadContent.value}\n\n${markdown}`
      : markdown
  } catch (err: any) {
    window.alert(`图片识别失败：${err?.response?.data?.error || err?.message || '未知错误'}`)
  } finally {
    ocrLoading.value = false
    input.value = ''
  }
}

async function fetchArticles() {
  loading.value = true
  error.value = ''
  try {
    grouped.value = await listGroupedArticles({
      page: currentPage.value,
      pageSize: 10,
      search: search.value.trim() || undefined,
    })
  } catch (e) {
    error.value = '加载文章失败，请稍后重试。'
    console.error(e)
  } finally {
    loading.value = false
  }
}

// Debounced search → resets page
let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    fetchArticles()
  }, 300)
}

function goToPage(page: number) {
  if (page < 1 || page > pagination.value.totalPages) return
  currentPage.value = page
  fetchArticles()
}

function openArticle(article: Article) {
  router.push(`/articles/${article.id}`)
}

function selectAsSource(article: Article) {
  router.push({ path: '/tasks/new', query: { source: article.id } })
}

function goToTask(taskId: string) {
  router.push(`/tasks/${taskId}`)
}

function openUpload() {
  uploadTitle.value = ''
  uploadContent.value = ''
  showUpload.value = true
}

async function saveUpload() {
  if (!uploadTitle.value.trim()) {
    window.alert('请输入标题')
    return
  }
  saving.value = true
  try {
    await api.post('/articles', {
      title: uploadTitle.value.trim(),
      content: uploadContent.value,
      source: 'upload',
    })
    showUpload.value = false
    await fetchArticles()
  } catch (e) {
    window.alert('保存失败，请稍后重试。')
    console.error(e)
  } finally {
    saving.value = false
  }
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  running: { label: '进行中', cls: 'bg-amber-100 text-amber-700' },
  completed: { label: '已完成', cls: 'bg-slate-100 text-slate-600' },
  cancelled: { label: '已取消', cls: 'bg-slate-100 text-text-muted' },
}

onMounted(fetchArticles)
</script>

<template>
  <div class="mx-auto max-w-6xl px-8 py-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-text">文章库</h1>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        @click="openUpload"
      >
        <span>＋</span> 上传文章
      </button>
    </div>

    <!-- Search -->
    <div class="mt-6">
      <div class="relative w-full max-w-xs">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">🔍</span>
        <input
          v-model="search"
          type="text"
          placeholder="搜索标题…"
          class="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-text outline-none focus:border-primary"
          @input="onSearchInput"
        />
      </div>
    </div>

    <!-- Error -->
    <div
      v-if="error"
      class="mt-6 rounded-lg border border-danger/30 bg-red-50 px-4 py-3 text-sm text-danger"
    >
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="mt-12 text-center text-sm text-text-secondary">
      加载中…
    </div>

    <!-- Empty -->
    <div
      v-else-if="!hasAnyContent && !search.trim()"
      class="mt-16 flex flex-col items-center justify-center text-center"
    >
      <div class="text-5xl">📄</div>
      <p class="mt-4 text-base font-medium text-text">还没有文章</p>
      <p class="mt-1 text-sm text-text-secondary">上传一篇文章开始吧</p>
    </div>

    <div
      v-else-if="!hasAnyContent && search.trim()"
      class="mt-16 flex flex-col items-center justify-center text-center"
    >
      <p class="text-sm text-text-secondary">没有找到匹配的文章</p>
    </div>

    <template v-else>
      <!-- Ungrouped (standalone uploads) -->
      <div v-if="grouped.ungrouped.length" class="mt-6">
        <h2 class="mb-3 text-sm font-semibold text-text-secondary">未分组素材</h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="article in grouped.ungrouped" :key="article.id" class="group relative">
            <ArticleCard :article="article" @click="openArticle(article)" />
            <button
              type="button"
              class="absolute right-3 top-3 hidden rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-primary shadow-sm ring-1 ring-border transition-colors hover:bg-primary-light group-hover:block"
              title="选为仿写源"
              @click.stop="selectAsSource(article)"
            >
              选为仿写源
            </button>
          </div>
        </div>
      </div>

      <!-- Task groups -->
      <div v-for="taskGroup in grouped.tasks" :key="taskGroup.id" class="mt-6">
        <div class="mb-3 flex items-center gap-2">
          <button
            type="button"
            class="text-sm text-text-muted"
            @click="toggleTaskCollapse(taskGroup.id)"
          >
            {{ collapsedTasks.has(taskGroup.id) ? '▸' : '▾' }}
          </button>
          <h2
            class="cursor-pointer text-sm font-semibold text-text hover:text-primary"
            @click="goToTask(taskGroup.id)"
          >
            {{ taskGroup.title }}
          </h2>
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="statusConfig[taskGroup.status]?.cls ?? 'bg-slate-100 text-text-muted'"
          >
            {{ statusConfig[taskGroup.status]?.label ?? taskGroup.status }}
          </span>
          <span class="text-xs text-text-muted">{{ taskGroup.articles.length }} 篇</span>
        </div>
        <div
          v-if="!collapsedTasks.has(taskGroup.id)"
          class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div v-for="article in taskGroup.articles" :key="article.id">
            <ArticleCard :article="article" @click="openArticle(article)" />
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div
        v-if="pagination.totalPages > 1"
        class="mt-8 flex items-center justify-center gap-2"
      >
        <button
          type="button"
          :disabled="currentPage <= 1"
          class="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-slate-50 disabled:opacity-40"
          @click="goToPage(currentPage - 1)"
        >
          ‹ 上一页
        </button>
        <span class="px-2 text-sm text-text-secondary">
          {{ currentPage }} / {{ pagination.totalPages }}
        </span>
        <button
          type="button"
          :disabled="currentPage >= pagination.totalPages"
          class="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-slate-50 disabled:opacity-40"
          @click="goToPage(currentPage + 1)"
        >
          下一页 ›
        </button>
      </div>
    </template>

    <!-- Upload dialog -->
    <div
      v-if="showUpload"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="showUpload = false"
    >
      <div class="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-card shadow-xl">
        <div class="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 class="text-lg font-semibold text-text">上传文章</h2>
          <button
            type="button"
            class="text-text-muted hover:text-text"
            @click="showUpload = false"
          >
            ✕
          </button>
        </div>

        <div class="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text">标题</label>
            <input
              v-model="uploadTitle"
              type="text"
              placeholder="输入文章标题"
              class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none focus:border-primary"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text">内容</label>
            <MarkdownEditor v-model="uploadContent" />
          </div>
        </div>

        <div class="flex justify-end gap-3 border-t border-border px-6 py-4">
          <input ref="ocrInput" type="file" accept="image/*" class="hidden" @change="onOcrFile" />
          <button
            type="button"
            :disabled="ocrLoading"
            class="mr-auto rounded-lg border border-dashed border-primary bg-primary-light px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-indigo-100 disabled:opacity-50"
            @click="ocrInput?.click()"
          >
            {{ ocrLoading ? '识别中…' : '📷 图片识别' }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-slate-50"
            @click="showUpload = false"
          >
            取消
          </button>
          <button
            type="button"
            :disabled="saving"
            class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            @click="saveUpload"
          >
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
