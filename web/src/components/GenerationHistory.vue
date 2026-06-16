<script setup lang="ts">
import type { GenerationItem } from '@/types'

withDefaults(
  defineProps<{
    generations: GenerationItem[]
    canRegenerate?: boolean
    selectedId?: string | null
  }>(),
  { canRegenerate: false, selectedId: null }
)

const emit = defineEmits<{
  (e: 'view', articleId: string): void
  (e: 'select', generation: GenerationItem): void
  (e: 'regenerate', generation: GenerationItem): void
}>()

function basedOnText(gen: GenerationItem): string {
  if (gen.based_on === 'source') return '基于源文章'
  if (gen.parent_sequence_num != null) return `基于 #${gen.parent_sequence_num}`
  return '基于历史'
}

function formatDate(s: string): string {
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncate(text: string, max = 60): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}
</script>

<template>
  <div v-if="generations.length === 0" class="py-8 text-center text-sm text-text-muted">
    暂无生成记录
  </div>

  <div v-else class="relative pl-6">
    <!-- Timeline line -->
    <div class="absolute bottom-0 left-[11px] top-0 w-px bg-border" />

    <div
      v-for="(gen, idx) in generations"
      :key="gen.id"
      class="relative pb-6 last:pb-0"
    >
      <!-- Timeline dot -->
      <div
        class="absolute -left-6 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 text-[10px] font-bold"
        :class="
          gen.pending
            ? 'border-amber-400 bg-amber-400 text-white animate-pulse'
            : gen.id === selectedId
              ? 'border-primary bg-primary text-white'
              : 'border-border bg-card text-text-secondary'
        "
      >
        {{ gen.sequence_num }}
      </div>

      <!-- Content card -->
      <div
        class="rounded-lg border p-3 transition-colors"
        :class="
          gen.pending
            ? 'border-amber-300 bg-amber-50'
            : gen.id === selectedId
              ? 'cursor-pointer border-primary/50 bg-primary-light/30 hover:bg-primary-light/40'
              : 'cursor-pointer border-border bg-card hover:bg-slate-50'
        "
        @click="!gen.pending && emit('select', gen)"
      >
        <!-- Title row (click to preview) -->
        <div
          class="flex items-center justify-between gap-2"
          :class="gen.pending ? '' : 'cursor-pointer'"
          @click="!gen.pending && emit('select', gen)"
        >
          <span class="text-sm font-semibold text-text">
            {{ gen.article_title }}
          </span>
          <span
            v-if="gen.pending"
            class="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600"
          >
            <span class="relative flex h-2 w-2">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span class="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            生成中…
          </span>
          <span v-else class="shrink-0 text-xs text-text-muted">
            {{ formatDate(gen.created_at) }}
          </span>
        </div>

        <!-- Prompt (click to preview) -->
        <p
          class="mt-1 text-xs text-text-secondary"
          :class="gen.pending ? '' : 'cursor-pointer'"
          :title="gen.prompt"
          @click="!gen.pending && emit('select', gen)"
        >
          {{ truncate(gen.prompt) }}
        </p>

        <!-- Badges + Actions -->
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-text-secondary">
            {{ basedOnText(gen) }}
          </span>

          <!-- Actions (hidden for pending) -->
          <div v-if="!gen.pending" class="ml-auto flex items-center gap-2">
            <template v-if="gen.file_found">
              <button
                type="button"
                class="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary-light"
                @click.stop="emit('view', gen.article_id)"
              >
                查看文章
              </button>
            </template>
            <span
              v-else
              class="flex items-center gap-1 text-xs text-warning"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              文章未找到
            </span>

            <button
              v-if="canRegenerate"
              type="button"
              class="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-amber-50 hover:text-amber-600"
              @click.stop="emit('regenerate', gen)"
            >
              重新生成
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
