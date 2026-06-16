<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  getLLMConfig,
  updateLLMGlobal,
  addLLMModel,
  updateLLMModel,
  deleteLLMModel,
  setDefaultLLMModel,
  getAvailableModels,
  testLLMConnection,
} from '@/api'
import type { LLMModel } from '@/types'

// ── Global auth ──
const baseUrl = ref('')
const authToken = ref('')
const maskedToken = ref('')

// ── Models ──
const models = ref<LLMModel[]>([])

const loading = ref(false)
const savingGlobal = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; msg: string } | null>(null)

// ── Model editing state ──
type Draft = { id?: string; role: 'text' | 'vision'; name: string; model: string }
const editing = ref<Draft | null>(null)
const savingModel = ref(false)

// ── Available models from the configured Base URL ──
const availableModels = ref<{ id: string; display_name: string }[]>([])
const loadingModels = ref(false)
const modelsError = ref('')
const showModelDropdown = ref(false)

const filteredModels = computed(() => {
  const q = (editing.value?.model ?? '').trim().toLowerCase()
  if (!q) return availableModels.value
  return availableModels.value.filter(
    (m) => m.id.toLowerCase().includes(q) || m.display_name.toLowerCase().includes(q),
  )
})

const textModels = computed(() => models.value.filter((m) => m.role === 'text'))
const visionModels = computed(() => models.value.filter((m) => m.role === 'vision'))

async function loadAvailableModels() {
  loadingModels.value = true
  modelsError.value = ''
  try {
    availableModels.value = await getAvailableModels()
  } catch (e: any) {
    modelsError.value = e?.response?.data?.error || e?.message || '无法获取模型列表'
    availableModels.value = []
  } finally {
    loadingModels.value = false
  }
}

function selectModel(opt: { id: string; display_name: string }) {
  if (!editing.value) return
  editing.value.model = opt.id
  if (!editing.value.name.trim()) editing.value.name = opt.display_name
  showModelDropdown.value = false
}

async function fetchConfig() {
  loading.value = true
  try {
    const data = await getLLMConfig()
    baseUrl.value = data.base_url
    maskedToken.value = data.auth_token_masked
    authToken.value = ''
    models.value = data.models
  } catch {
    // not configured yet — fine
  } finally {
    loading.value = false
  }
}

async function saveGlobal() {
  if (!baseUrl.value.trim()) {
    window.alert('请填写 Base URL')
    return
  }
  savingGlobal.value = true
  try {
    const payload: { auth_token?: string; base_url: string } = {
      base_url: baseUrl.value.trim(),
    }
    if (authToken.value) payload.auth_token = authToken.value
    await updateLLMGlobal(payload)
    window.alert('认证设置已保存')
    await fetchConfig()
  } catch {
    window.alert('保存失败，请稍后重试')
  } finally {
    savingGlobal.value = false
  }
}

function newModel(role: 'text' | 'vision') {
  editing.value = { role, name: '', model: '' }
  showModelDropdown.value = false
  loadAvailableModels()
}

function editModel(m: LLMModel) {
  editing.value = { id: m.id, role: m.role, name: m.name, model: m.model }
  showModelDropdown.value = false
  loadAvailableModels()
}

function cancelEdit() {
  editing.value = null
  showModelDropdown.value = false
}

async function saveModel() {
  if (!editing.value) return
  const d = editing.value
  if (!d.name.trim() || !d.model.trim()) {
    window.alert('请填写名称和模型标识')
    return
  }
  savingModel.value = true
  try {
    if (d.id) {
      await updateLLMModel(d.id, { role: d.role, name: d.name.trim(), model: d.model.trim() })
    } else {
      await addLLMModel({ role: d.role, name: d.name.trim(), model: d.model.trim() })
    }
    editing.value = null
    await fetchConfig()
  } catch {
    window.alert('保存模型失败')
  } finally {
    savingModel.value = false
  }
}

async function removeModel(m: LLMModel) {
  if (!window.confirm(`确定删除模型「${m.name}」？`)) return
  try {
    await deleteLLMModel(m.id)
    await fetchConfig()
  } catch {
    window.alert('删除失败')
  }
}

async function makeDefault(m: LLMModel) {
  if (m.is_default === 1) return
  try {
    await setDefaultLLMModel(m.id)
    await fetchConfig()
  } catch {
    window.alert('设置默认模型失败')
  }
}

async function testConn() {
  testing.value = true
  testResult.value = null
  try {
    const res = await testLLMConnection()
    testResult.value = { ok: res.success, msg: res.message }
  } catch (e: any) {
    testResult.value = { ok: false, msg: e?.message || '连接失败' }
  } finally {
    testing.value = false
  }
}

onMounted(fetchConfig)
</script>

<template>
  <div class="mx-auto max-w-3xl px-8 py-6">
    <h1 class="text-2xl font-bold text-text">设置</h1>
    <p class="mt-1 text-sm text-text-secondary">
      配置 Anthropic 认证与多个模型（文本模型用于仿写，多模态模型用于图片识别）
    </p>

    <div v-if="loading" class="mt-12 text-center text-sm text-text-muted">加载中…</div>

    <div v-else class="mt-8 space-y-10">
      <!-- ── Global auth ── -->
      <section>
        <h2 class="mb-4 text-lg font-semibold text-text">认证设置</h2>
        <div class="space-y-4">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text">Base URL</label>
            <input
              v-model="baseUrl"
              type="text"
              placeholder="https://api.anthropic.com"
              class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none focus:border-primary"
            />
            <p class="mt-1 text-xs text-text-muted">ANTHROPIC_BASE_URL — 可指向官方或兼容网关</p>
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text">Auth Token</label>
            <input
              v-model="authToken"
              type="password"
              :placeholder="maskedToken || '输入 ANTHROPIC_AUTH_TOKEN'"
              class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none focus:border-primary"
            />
            <p v-if="maskedToken" class="mt-1 text-xs text-text-muted">
              当前 Token：{{ maskedToken }}（留空则不更新）
            </p>
            <p v-else class="mt-1 text-xs text-text-muted">ANTHROPIC_AUTH_TOKEN</p>
          </div>
          <div class="flex items-center gap-3">
            <button
              type="button"
              :disabled="savingGlobal"
              class="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
              @click="saveGlobal"
            >
              {{ savingGlobal ? '保存中…' : '保存认证' }}
            </button>
            <button
              type="button"
              :disabled="testing"
              class="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-slate-50 disabled:opacity-50"
              @click="testConn"
            >
              {{ testing ? '测试中…' : '测试连接' }}
            </button>
          </div>
          <div
            v-if="testResult"
            class="rounded-lg px-4 py-3 text-sm"
            :class="
              testResult.ok
                ? 'border border-green-200 bg-green-50 text-green-700'
                : 'border border-red-200 bg-red-50 text-danger'
            "
          >
            {{ testResult.msg }}
          </div>
        </div>
      </section>

      <!-- ── Models ── -->
      <section>
        <h2 class="mb-4 text-lg font-semibold text-text">模型列表</h2>

        <!-- Text models -->
        <div class="mb-6">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-text">文本模型（仿写）</h3>
            <button
              type="button"
              class="rounded-md border border-dashed border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary-light"
              @click="newModel('text')"
            >
              ＋ 添加文本模型
            </button>
          </div>
          <div class="space-y-2">
            <div
              v-for="m in textModels"
              :key="m.id"
              class="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5"
            >
              <div>
                <span class="text-sm font-medium text-text">{{ m.name }}</span>
                <span
                  v-if="m.is_default === 1"
                  class="ml-2 rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary"
                >默认</span>
                <span class="ml-2 text-xs text-text-muted">{{ m.model }}</span>
              </div>
              <div class="flex gap-2">
                <button v-if="m.is_default !== 1" type="button" class="text-xs text-text-secondary hover:text-primary" @click="makeDefault(m)">设为默认</button>
                <button type="button" class="text-xs text-text-secondary hover:text-primary" @click="editModel(m)">编辑</button>
                <button type="button" class="text-xs text-text-secondary hover:text-danger" @click="removeModel(m)">删除</button>
              </div>
            </div>
            <p v-if="!textModels.length" class="rounded-lg border border-dashed border-border py-3 text-center text-xs text-text-muted">
              暂无文本模型
            </p>
          </div>
        </div>

        <!-- Vision models -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-text">多模态模型（图片识别）</h3>
            <button
              type="button"
              class="rounded-md border border-dashed border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary-light"
              @click="newModel('vision')"
            >
              ＋ 添加多模态模型
            </button>
          </div>
          <div class="space-y-2">
            <div
              v-for="m in visionModels"
              :key="m.id"
              class="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5"
            >
              <div>
                <span class="text-sm font-medium text-text">{{ m.name }}</span>
                <span
                  v-if="m.is_default === 1"
                  class="ml-2 rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary"
                >默认</span>
                <span class="ml-2 text-xs text-text-muted">{{ m.model }}</span>
              </div>
              <div class="flex gap-2">
                <button v-if="m.is_default !== 1" type="button" class="text-xs text-text-secondary hover:text-primary" @click="makeDefault(m)">设为默认</button>
                <button type="button" class="text-xs text-text-secondary hover:text-primary" @click="editModel(m)">编辑</button>
                <button type="button" class="text-xs text-text-secondary hover:text-danger" @click="removeModel(m)">删除</button>
              </div>
            </div>
            <p v-if="!visionModels.length" class="rounded-lg border border-dashed border-border py-3 text-center text-xs text-text-muted">
              暂无多模态模型
            </p>
          </div>
        </div>
      </section>
    </div>

    <!-- ── Model edit dialog ── -->
    <div
      v-if="editing"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div class="w-full max-w-md rounded-xl bg-card shadow-xl">
        <div class="border-b border-border px-6 py-4">
          <h2 class="text-lg font-semibold text-text">
            {{ editing.id ? '编辑模型' : '添加模型' }}
          </h2>
        </div>
        <div class="space-y-4 p-6">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text">用途</label>
            <select
              v-model="editing.role"
              class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none focus:border-primary"
            >
              <option value="text">文本模型（仿写）</option>
              <option value="vision">多模态模型（图片识别）</option>
            </select>
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-text">显示名称</label>
            <input
              v-model="editing.name"
              type="text"
              placeholder="例如：Claude 3.5 Sonnet"
              class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none focus:border-primary"
            />
          </div>
          <div class="relative">
            <label class="mb-1.5 flex items-center gap-2 text-sm font-medium text-text">
              模型标识
              <button
                v-if="!loadingModels"
                type="button"
                class="text-xs text-text-secondary hover:text-primary"
                @click="loadAvailableModels"
              >
                刷新列表
              </button>
              <span v-if="loadingModels" class="text-xs text-text-muted">拉取中…</span>
            </label>
            <input
              v-model="editing.model"
              type="text"
              placeholder="输入或选择模型…"
              autocomplete="off"
              class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none focus:border-primary"
              @focus="showModelDropdown = true"
              @blur="showModelDropdown = false"
            />
            <!-- Dropdown -->
            <div
              v-if="showModelDropdown && !loadingModels && filteredModels.length"
              class="absolute left-0 z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
            >
              <button
                v-for="opt in filteredModels"
                :key="opt.id"
                type="button"
                class="flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50"
                @mousedown.prevent="selectModel(opt)"
              >
                <span class="text-sm text-text">{{ opt.id }}</span>
                <span v-if="opt.display_name !== opt.id" class="text-xs text-text-muted">{{ opt.display_name }}</span>
              </button>
            </div>
            <!-- No results / error -->
            <div
              v-if="showModelDropdown && !loadingModels && !filteredModels.length && availableModels.length"
              class="absolute left-0 z-10 mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-text-muted shadow-lg"
            >
              无匹配模型
            </div>
            <p v-if="modelsError" class="mt-1 text-xs text-danger">{{ modelsError }}（可手动输入）</p>
          </div>
        </div>
        <div class="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-slate-50"
            @click="cancelEdit"
          >
            取消
          </button>
          <button
            type="button"
            :disabled="savingModel"
            class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            @click="saveModel"
          >
            {{ savingModel ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
