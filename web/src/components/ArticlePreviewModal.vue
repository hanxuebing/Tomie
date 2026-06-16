<script setup lang="ts">
import { ref, watch } from 'vue'
import api from '@/api'
import MarkdownViewer from './MarkdownViewer.vue'

const props = defineProps<{
  visible: boolean
  articleId: string | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
}>()

const title = ref('')
const content = ref('')
const loading = ref(false)
const error = ref('')

watch(
  () => props.visible,
  async (v) => {
    if (v && props.articleId) {
      loading.value = true
      error.value = ''
      title.value = ''
      content.value = ''
      try {
        const { data } = await api.get(`/articles/${props.articleId}`)
        title.value = data.title
        content.value = data.content ?? ''
      } catch {
        error.value = '加载文章失败'
      } finally {
        loading.value = false
      }
    }
  },
)

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
        @click.self="close"
      >
        <div
          class="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-card shadow-2xl"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 class="truncate text-lg font-semibold text-text">
              {{ loading ? '加载中...' : title || '文章预览' }}
            </h2>
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

          <!-- Content -->
          <div class="flex-1 overflow-y-auto px-6 py-4">
            <div v-if="loading" class="py-12 text-center text-sm text-text-muted">
              加载中...
            </div>
            <div v-else-if="error" class="py-12 text-center text-sm text-red-500">
              {{ error }}
            </div>
            <MarkdownViewer v-else :content="content" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
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
