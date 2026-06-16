<script setup lang="ts">
import type { GenerationItem } from '@/types'

withDefaults(
  defineProps<{
    generations: GenerationItem[]
    canRegenerate?: boolean
  }>(),
  { canRegenerate: false }
)

const emit = defineEmits<{
  (e: 'view', articleId: string): void
  (e: 'select', generation: GenerationItem): void
  (e: 'regenerate', generation: GenerationItem): void
}>()

const basedOnLabel: Record<GenerationItem['based_on'], string> = {
  source: '基于原文',
  previous: '基于上一次生成',
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
          idx === generations.length - 1
            ? 'border-primary bg-primary text-white'
            : 'border-border bg-card text-text-secondary'
        "
      >
        {{ gen.sequence_num }}
      </div>

      <!-- Content card -->
      <div
        class="rounded-lg border p-3"
        :class="
          idx === generations.length - 1
            ? 'border-primary/30 bg-primary-light/40'
            : 'border-border bg-card'
        "
      >
        <!-- Title row -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-semibold text-text">
            {{ gen.article_title }}
          </span>
          <span class="shrink-0 text-xs text-text-muted">
            {{ formatDate(gen.created_at) }}
          </span>
        </div>

        <!-- Prompt -->
        <p class="mt-1 text-xs text-text-secondary" :title="gen.prompt">
          {{ truncate(gen.prompt) }}
        </p>

        <!-- Badges + Actions -->
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-text-secondary">
            {{ basedOnLabel[gen.based_on] }}
          </span>

          <!-- Actions -->
          <div class="ml-auto flex items-center gap-2">
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
              type="button"
              class="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-slate-50 hover:text-text"
              @click.stop="emit('select', gen)"
            >
              基于此修改
            </button>

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
