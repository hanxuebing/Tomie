<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import type { Article } from '@/types'
import MarkdownViewer from '@/components/MarkdownViewer.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { useCopyContent } from '@/composables/useCopyContent'

const route = useRoute()
const router = useRouter()

const article = ref<Article | null>(null)
const loading = ref(false)
const error = ref('')
const notFound = ref(false)

const editing = ref(false)
const editTitle = ref('')
const editContent = ref('')
const saving = ref(false)

const sourceConfig: Record<Article['source'], { label: string; cls: string }> = {
  upload: { label: '原始', cls: 'bg-blue-100 text-blue-700' },
  generated: { label: '生成', cls: 'bg-purple-100 text-purple-700' },
}

async function fetchArticle() {
  loading.value = true
  error.value = ''
  notFound.value = false
  try {
    const { data } = await api.get<Article>(`/articles/${route.params.id}`)
    article.value = data
    if (data.found === false) {
      notFound.value = true
    }
  } catch (e) {
    error.value = '加载文章失败，请稍后重试。'
    console.error(e)
  } finally {
    loading.value = false
  }
}

function startEdit() {
  if (!article.value) return
  editTitle.value = article.value.title
  editContent.value = article.value.content ?? ''
  editing.value = true
}

function cancelEdit() {
  editing.value = false
}

async function save() {
  if (!article.value) return
  if (!editTitle.value.trim()) {
    window.alert('请输入标题')
    return
  }
  saving.value = true
  try {
    const { data } = await api.put<Article>(`/articles/${article.value.id}`, {
      title: editTitle.value.trim(),
      content: editContent.value,
    })
    article.value = data
    editing.value = false
  } catch (e) {
    window.alert('保存失败，请稍后重试。')
    console.error(e)
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!article.value) return
  if (!window.confirm(`确定删除文章「${article.value.title}」吗？`)) return
  try {
    await api.delete(`/articles/${article.value.id}`)
    router.push('/articles')
  } catch (e) {
    window.alert('删除失败，请稍后重试。')
    console.error(e)
  }
}

function selectAsSource() {
  if (!article.value) return
  router.push({ path: '/tasks/new', query: { source: article.value.id } })
}

onMounted(fetchArticle)

const { copyTextSuccess, copyMdSuccess, copyAsPlainText, copyAsMarkdown } = useCopyContent(
  () => article.value?.content ?? ''
)
</script>

<template>
  <div class="mx-auto max-w-4xl px-8 py-6">
    <!-- Top bar -->
    <div class="flex items-center justify-between gap-4">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text"
        @click="router.push('/articles')"
      >
        ← 返回
      </button>

      <div v-if="article && !notFound" class="flex items-center gap-2">
        <button
          v-if="!editing"
          type="button"
          class="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-slate-50"
          @click="selectAsSource"
        >
          选为仿写源
        </button>
        <button
          v-if="!editing"
          type="button"
          class="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-slate-50"
          @click="startEdit"
        >
          编辑
        </button>
        <button
          v-if="editing"
          type="button"
          class="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-slate-50"
          @click="cancelEdit"
        >
          取消
        </button>
        <button
          v-if="editing"
          type="button"
          :disabled="saving"
          class="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          @click="save"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <button
          v-if="!editing"
          type="button"
          class="rounded-lg border border-danger/30 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-red-50"
          @click="remove"
        >
          删除
        </button>
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
    <div v-else-if="loading" class="mt-12 text-center text-sm text-text-secondary">
      加载中…
    </div>

    <!-- Not found -->
    <div
      v-else-if="notFound"
      class="mt-12 rounded-xl border border-warning/30 bg-amber-50 p-8 text-center"
    >
      <div class="text-5xl">⚠️</div>
      <p class="mt-4 text-lg font-semibold text-text">文章未找到</p>
      <p class="mt-2 text-sm text-text-secondary">
        该文章的源文件可能已被移动或删除。元数据仍存在，但内容无法读取。
      </p>
    </div>

    <!-- Content -->
    <div v-else-if="article" class="mt-6">
      <!-- Edit mode -->
      <div v-if="editing" class="flex flex-col gap-4">
        <div>
          <label class="mb-1.5 block text-sm font-medium text-text">标题</label>
          <input
            v-model="editTitle"
            type="text"
            class="w-full rounded-lg border border-border bg-card px-3 py-2 text-base font-medium text-text outline-none focus:border-primary"
          />
        </div>
        <MarkdownEditor v-model="editContent" />
      </div>

      <!-- View mode -->
      <div v-else>
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="text-2xl font-bold text-text">{{ article.title }}</h1>
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="sourceConfig[article.source].cls"
          >
            {{ sourceConfig[article.source].label }}
          </span>
          <div class="ml-auto flex items-center gap-2">
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
        <div class="mt-6 rounded-xl border border-border bg-card p-6">
          <MarkdownViewer :content="article.content ?? ''" />
        </div>
      </div>
    </div>
  </div>
</template>
