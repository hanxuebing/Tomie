<script setup lang="ts">
withDefaults(
  defineProps<{
    visible: boolean
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
  }>(),
  { title: '请确认', confirmText: '确认', cancelText: '取消' },
)

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
        @click.self="emit('cancel')"
      >
        <div class="w-full max-w-sm rounded-2xl bg-card shadow-2xl" @click.stop>
          <div class="px-6 py-5">
            <h2 class="text-lg font-semibold text-text">{{ title }}</h2>
            <p class="mt-3 text-sm text-text-secondary">{{ message }}</p>
          </div>
          <div class="flex justify-end gap-2 border-t border-border px-6 py-3">
            <button
              type="button"
              class="rounded-lg border border-border bg-card px-4 py-1.5 text-sm font-medium text-text transition-colors hover:bg-slate-50"
              @click="emit('cancel')"
            >
              {{ cancelText }}
            </button>
            <button
              type="button"
              class="rounded-lg bg-danger px-4 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90"
              @click="emit('confirm')"
            >
              {{ confirmText }}
            </button>
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
