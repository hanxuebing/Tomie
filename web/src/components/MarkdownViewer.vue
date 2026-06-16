<script setup lang="ts">
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

defineProps<{
  content: string
}>()
</script>

<template>
  <MdPreview
    :model-value="content"
    language="zh-CN"
    preview-theme="github"
  />
</template>
