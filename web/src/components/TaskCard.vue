<script setup lang="ts">
import type { Task } from '@/types'

const props = defineProps<{
  task: Task
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'delete'): void
  (e: 'close'): void
}>()

const statusConfig: Record<Task['status'], { label: string; cls: string }> = {
  running: { label: '进行中', cls: 'text-success' },
  completed: { label: '已完成', cls: 'text-success' },
  cancelled: { label: '已取消', cls: 'text-text-muted' },
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

function onDelete() {
  if (window.confirm(`确定删除任务「${props.task.title}」吗？`)) {
    emit('delete')
  }
}

function onClose() {
  if (window.confirm(`确定关闭任务「${props.task.title}」吗？关闭后任务将标记为已完成。`)) {
    emit('close')
  }
}
</script>

<template>
  <div
    class="group relative cursor-pointer rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
    @click="emit('click')"
  >
    <!-- Action buttons (hover only) -->
    <div class="absolute right-3 top-3 hidden items-center gap-1 group-hover:flex">
      <button
        v-if="task.status === 'running'"
        type="button"
        class="rounded-md p-1.5 text-text-muted transition-colors hover:bg-green-50 hover:text-success"
        title="关闭任务"
        @click.stop="onClose"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
      <button
        type="button"
        class="rounded-md p-1.5 text-text-muted transition-colors hover:bg-red-50 hover:text-danger"
        title="删除任务"
        @click.stop="onDelete"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </div>

    <!-- Title -->
    <h3 class="pr-8 text-base font-semibold text-text line-clamp-2">
      {{ task.title }}
    </h3>

    <!-- Badges -->
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <span v-if="task.status !== 'running'" class="inline-flex items-center gap-1.5 text-xs font-medium" :class="statusConfig[task.status].cls">
        <span
          class="h-2 w-2 rounded-full"
          :class="task.status === 'completed' ? 'bg-success' : 'bg-text-muted'"
        />
        {{ statusConfig[task.status].label }}
      </span>

      <!-- 生成中/空闲（仅进行中任务） -->
      <span
        v-if="task.status === 'running'"
        class="inline-flex items-center gap-1.5 text-xs font-medium"
        :class="task.is_running ? 'text-amber-600' : 'text-text-muted'"
      >
        <span v-if="task.is_running" class="relative flex h-2 w-2">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
          <span class="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
        <span v-else class="h-2 w-2 rounded-full bg-text-muted/40" />
        {{ task.is_running ? '生成中' : '空闲' }}
      </span>

      <!-- 未读标记 -->
      <span
        v-if="task.has_unread"
        class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600"
      >
        未读{{ task.unread_count ? ` (${task.unread_count})` : '' }}
      </span>
    </div>

    <!-- Counts + date -->
    <div class="mt-3 flex items-center justify-between text-xs text-text-secondary">
      <div class="flex items-center gap-3">
        <span>素材 {{ task.source_count ?? 0 }}</span>
        <span>生成 {{ task.generation_count ?? 0 }}</span>
      </div>
      <span class="text-text-muted">{{ formatDate(task.created_at) }}</span>
    </div>
  </div>
</template>
