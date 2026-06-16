<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const navLinks = [
  { label: '任务中心', to: '/tasks', match: '/tasks' },
  { label: '文章库', to: '/articles', match: '/articles' },
  { label: '设置', to: '/settings', match: '/settings' },
]

function isActive(match: string): boolean {
  return route.path === match || route.path.startsWith(match + '/')
}
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden">
    <!-- Sidebar -->
    <aside
      class="flex w-60 shrink-0 flex-col border-r border-border bg-slate-50"
    >
      <div class="flex h-16 items-center gap-2 px-6">
        <img
          src="@/assets/logo/tomie_logo.jpeg"
          alt="Tomie"
          class="h-8 w-8 rounded-lg object-cover"
        />
        <span class="text-xl font-bold tracking-tight text-text">Tomie</span>
      </div>

      <nav class="flex flex-1 flex-col gap-1 px-3 py-2">
        <router-link
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="
            isActive(link.match)
              ? 'bg-primary-light text-primary'
              : 'text-text-secondary hover:bg-slate-100 hover:text-text'
          "
        >
          {{ link.label }}
        </router-link>
      </nav>
    </aside>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto bg-bg">
      <router-view />
    </main>
  </div>
</template>
