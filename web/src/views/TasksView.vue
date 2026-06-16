<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import type { Task } from '@/types'
import TaskCard from '@/components/TaskCard.vue'

type Tab = 'running' | 'finished'

const router = useRouter()
const activeTab = ref<Tab>('running')
const tasks = ref<Task[]>([])
const loading = ref(false)
const error = ref('')

const tabs: { key: Tab; label: string }[] = [
  { key: 'running', label: '进行中' },
  { key: 'finished', label: '已完成' },
]

const isEmpty = computed(() => !loading.value && tasks.value.length === 0)

async function fetchTasks() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.get<Task[]>('/tasks', {
      params: { status: activeTab.value },
    })
    tasks.value = res.data
  } catch (e) {
    error.value = '加载任务失败，请稍后重试'
    tasks.value = []
  } finally {
    loading.value = false
  }
}

function switchTab(tab: Tab) {
  if (activeTab.value === tab) return
  activeTab.value = tab
  fetchTasks()
}

function openTask(task: Task) {
  router.push(`/tasks/${task.id}`)
}

async function deleteTask(task: Task) {
  try {
    await api.delete(`/tasks/${task.id}`)
    await fetchTasks()
  } catch (e) {
    window.alert('删除失败，请稍后重试')
  }
}

async function closeTask(task: Task) {
  try {
    await api.put(`/tasks/${task.id}/complete`)
    await fetchTasks()
  } catch (e) {
    window.alert('操作失败，请稍后重试')
  }
}

onMounted(fetchTasks)
</script>

<template>
  <div class="mx-auto max-w-6xl px-8 py-6">
    <!-- Top bar -->
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold text-text">任务中心</h1>
      <router-link
        to="/tasks/new"
        class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
      >
        <span class="text-base leading-none">＋</span>
        新建任务
      </router-link>
    </div>

    <!-- Tab bar -->
    <div class="mb-6 flex gap-6 border-b border-border">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="relative -mb-px pb-3 text-sm font-medium transition-colors"
        :class="
          activeTab === tab.key
            ? 'text-primary'
            : 'text-text-secondary hover:text-text'
        "
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
        <span
          v-if="activeTab === tab.key"
          class="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary"
        />
      </button>
    </div>

    <!-- Error -->
    <div
      v-if="error"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
    >
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-20 text-center text-sm text-text-muted">
      加载中…
    </div>

    <!-- Empty -->
    <div
      v-else-if="isEmpty"
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center"
    >
      <div class="mb-3 text-4xl">📭</div>
      <p class="text-sm text-text-secondary">
        {{ activeTab === 'running' ? '暂无进行中的任务' : '暂无已完成的任务' }}
      </p>
      <router-link
        v-if="activeTab === 'running'"
        to="/tasks/new"
        class="mt-4 text-sm font-medium text-primary hover:underline"
      >
        创建第一个任务 →
      </router-link>
    </div>

    <!-- Grid -->
    <div
      v-else
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <TaskCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        @click="openTask(task)"
        @delete="deleteTask(task)"
        @close="closeTask(task)"
      />
    </div>
  </div>
</template>
