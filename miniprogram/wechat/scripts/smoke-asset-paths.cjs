const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const uploadedPaths = []
const originalLoad = Module._load

Module._load = function load(request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    return {
      DYNAMIC_CURRENT_ENV: 'mock-env',
      init() {},
      uploadFile({ cloudPath }) {
        uploadedPaths.push(cloudPath)
        return Promise.resolve({ fileID: `cloud://mock/${cloudPath}` })
      },
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

async function main() {
  const { createGenerationTask } = require(path.resolve(__dirname, '../../cloudfunctions/common/generation-service.js'))
  const model = { apiProtocol: 'preview', keyMode: 'platform' }
  await createGenerationTask({
    mode: 'txt2img',
    prompt: 'image smoke',
    modelId: 'preview-image',
    width: 512,
    height: 512,
    batchSize: 1,
  }, model, 'asset-path-smoke')
  await createGenerationTask({
    mode: 'txt2video',
    prompt: 'video smoke',
    modelId: 'preview-video',
    width: 512,
    height: 512,
    batchSize: 1,
  }, model, 'asset-path-smoke')

  assert.ok(uploadedPaths.some((item) => item.startsWith('assets/images/')), 'image assets must be uploaded under assets/images/')
  assert.ok(uploadedPaths.some((item) => item.startsWith('assets/videos/')), 'video assets must be uploaded under assets/videos/')
  console.log('Asset cloud paths verified.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
