<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Article } from '@/types'
import api from '@/api'
import ArticleCard from './ArticleCard.vue'
import ArticlePreviewModal from './ArticlePreviewModal.vue'

const props = withDefaults(defineProps<{
  visible: boolean
  selectedIds: string[]
  multiple?: boolean
}>(), {
  multiple: true,
})

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'update:selectedIds', v: string[]): void
  (e: 'confirm', ids: string[]): void
}>()

const articles = ref<Article[]>([])
const loading = ref(false)
const search = ref('')

const filteredArticles = computed(() => {
  return articles.value.filter((a) => {
    return !search.value || a.title.toLowerCase().includes(search.value.toLowerCase())
  })
})

const localSelected = ref<Set<string>>(new Set(props.selectedIds))

watch(
  () => props.selectedIds,
  (ids) => {
    localSelected.value = new Set(ids)
  },
)

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      localSelected.value = new Set(props.selectedIds)
      search.value = ''
      await loadArticles()
    }
  },
)

async function loadArticles() {
  loading.value = true
  try {
    const { data } = await api.get<Article[]>('/articles', {
      params: { standalone: 'true', source: 'upload' }
    })
    articles.value = data
  } catch {
    articles.value = []
  } finally {
    loading.value = false
  }
}

function toggleSelect(id: string) {
  const next = new Set(localSelected.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    if (!props.multiple) next.clear()
    next.add(id)
  }
  localSelected.value = next
}

function isSelected(id: string) {
  return localSelected.value.has(id)
}

function onConfirm() {
  const ids = [...localSelected.value]
  emit('update:selectedIds', ids)
  emit('confirm', ids)
  close()
}

function close() {
  emit('update:visible', false)
}

const previewVisible = ref(false)
const previewArticleId = ref<string | null>(null)

function openPreview(id: string) {
  previewArticleId.value = id
  previewVisible.value = true
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="close"
      >
        <div
          class="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-card shadow-xl"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 class="text-lg font-semibold text-text">选择文章</h2>
            <button
              type="button"
              class="rounded-md p-1 text-text-muted transition-colors hover:text-text"
              @click="close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- Search -->
          <div class="border-b border-border px-6 py-3">
            <input
              v-model="search"
              type="text"
              placeholder="搜索素材标题..."
              class="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <!-- Article list -->
          <div class="flex-1 overflow-y-auto px-6 py-3">
            <div v-if="loading" class="py-12 text-center text-sm text-text-muted">
              加载中...
            </div>
            <div
              v-else-if="filteredArticles.length === 0"
              class="py-12 text-center text-sm text-text-muted"
            >
              暂无文章
            </div>
            <div v-else class="grid gap-2">
              <ArticleCard
                v-for="article in filteredArticles"
                :key="article.id"
                :article="article"
                :selectable="true"
                :selected="isSelected(article.id)"
                @select="toggleSelect(article.id)"
                @preview="openPreview(article.id)"
              />
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between border-t border-border px-6 py-4">
            <span class="text-sm text-text-secondary">
              已选择 {{ localSelected.size }} 篇文章
            </span>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-slate-50"
                @click="close"
              >
                取消
              </button>
              <button
                type="button"
                class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                @click="onConfirm"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <ArticlePreviewModal
    v-model:visible="previewVisible"
    :article-id="previewArticleId"
  />
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
