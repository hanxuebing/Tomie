<script setup lang="ts">
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function onChange(value: string) {
  emit('update:modelValue', value)
}
</script>

<template>
  <MdEditor
    :model-value="modelValue"
    language="zh-CN"
    preview-theme="github"
    @update:model-value="onChange"
  />
</template>
