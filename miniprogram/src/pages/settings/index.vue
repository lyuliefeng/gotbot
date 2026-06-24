<script setup lang="ts">
import { reactive } from 'vue'
import { useMiniAppStore } from '@/stores/app'
import type { ModelProfile } from '@/types'
import { createId } from '@/domain/ids'

const store = useMiniAppStore()

const draft = reactive<ModelProfile>({
  id: '',
  name: '我的图像模型',
  provider: 'openai-compatible',
  endpoint: 'https://api.openai.com',
  apiPath: 'v1/images/generations',
  apiProtocol: 'openai-images',
  apiKey: '',
  apiSecret: '',
  model: 'gpt-image-1',
  kind: 'image',
  isPrimary: false,
  status: 'untested',
  keyMode: 'user',
})

function edit(model: ModelProfile): void {
  Object.assign(draft, { ...model, apiKey: '', apiSecret: '' })
}

async function save(): Promise<void> {
  await store.saveModel({ ...draft, id: draft.id || createId('model') })
  Object.assign(draft, { id: '', name: '我的图像模型', keyMode: 'user', apiKey: '', apiSecret: '' })
}
</script>

<template>
  <section class="page">
    <div class="section">
      <h2>模型配置</h2>
      <p class="muted">用户 Key 会交给云函数加密保存；平台 Key 只从云函数环境变量读取，不会下发到小程序。</p>
      <div class="field">
        <label>名称<input v-model="draft.name" /></label>
      </div>
      <div class="grid-fields">
        <label>Key 模式
          <select v-model="draft.keyMode">
            <option value="user">用户自带 Key</option>
            <option value="platform">平台统一 Key</option>
          </select>
        </label>
        <label>协议
          <select v-model="draft.apiProtocol">
            <option value="openai-images">OpenAI Images</option>
            <option value="openai-image-edits">OpenAI Image Edits</option>
            <option value="dashscope-wanxiang">通义万相</option>
            <option value="multimodal-chat">多模态 Chat</option>
            <option value="mgtv-storyboard">MGTV 分镜</option>
            <option value="agnes-image">Agnes Image</option>
          </select>
        </label>
        <label>Base URL<input v-model="draft.endpoint" /></label>
        <label>API Path<input v-model="draft.apiPath" /></label>
        <label>模型 ID<input v-model="draft.model" /></label>
        <label v-if="draft.keyMode === 'user'">API Key<input v-model="draft.apiKey" type="password" /></label>
        <label v-if="draft.keyMode === 'user'">Secret Key<input v-model="draft.apiSecret" type="password" /></label>
      </div>
      <div class="action-row">
        <button class="primary-button" type="button" @click="save">保存模型</button>
        <button class="soft-button" type="button" @click="store.testModel(draft)">检测连接</button>
      </div>
      <p v-if="store.statusMessage" class="muted">{{ store.statusMessage }}</p>
    </div>

    <div class="section">
      <h3>已配置模型</h3>
      <article v-for="model in store.models" :key="model.id" class="tool-card">
        <h3>{{ model.name }}</h3>
        <p class="muted">{{ model.apiProtocol }} · {{ model.keyMode === 'platform' ? '平台 Key' : '用户 Key' }}</p>
        <div class="action-row">
          <button class="soft-button" type="button" @click="edit(model)">编辑</button>
          <button class="soft-button" type="button" @click="store.testModel(model)">检测</button>
          <button class="soft-button" type="button" @click="store.deleteModel(model.id)">删除</button>
        </div>
      </article>
    </div>
  </section>
</template>
