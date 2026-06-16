<script setup lang="ts">
import type { Article } from '@/types'

const props = withDefaults(defineProps<{
  article: Article
  selectable?: boolean
  selected?: boolean
}>(), {
  selectable: false,
  selected: false,
})

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'select'): void
  (e: 'preview'): void
}>()

const sourceConfig: Record<Article['source'], { label: string; cls: string }> = {
  upload: { label: '原始', cls: 'bg-blue-100 text-blue-700' },
  generated: { label: '生成', cls: 'bg-emerald-100 text-emerald-700' },
}

function formatDate(s: string): string {
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function handleClick() {
  if (props.selectable) {
    emit('select')
  } else {
    emit('click')
  }
}
</script>

<template>
  <div
    class="cursor-pointer rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
    :class="selected ? 'border-primary ring-2 ring-primary/20' : 'border-border'"
    @click="handleClick"
  >
    <div class="flex items-start gap-3">
      <!-- Checkbox -->
      <label
        v-if="selectable"
        class="mt-0.5 flex shrink-0 items-center"
        @click.stop
      >
        <input
          type="checkbox"
          :checked="selected"
          class="h-4 w-4 rounded border-slate-300 text-primary accent-primary"
          @change="emit('select')"
        />
      </label>

      <div class="min-w-0 flex-1">
        <!-- Title + Preview -->
        <div class="flex items-start justify-between gap-2">
          <h3 class="text-sm font-semibold text-text line-clamp-2">
            {{ article.title }}
          </h3>
          <button
            v-if="selectable"
            type="button"
            class="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-primary"
            title="预览文章"
            @click.stop="emit('preview')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>

        <!-- Badge + Date -->
        <div class="mt-2 flex items-center justify-between">
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="sourceConfig[article.source].cls"
          >
            {{ sourceConfig[article.source].label }}
          </span>
          <span class="text-xs text-text-muted">{{ formatDate(article.created_at) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
