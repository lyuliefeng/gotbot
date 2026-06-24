const protocolDefaults = {
  'openai-images': 'v1/images/generations',
  'openai-image-edits': 'v1/images/edits',
  'dashscope-wanxiang': 'api/v1/services/aigc/multimodal-generation/generation',
  'multimodal-chat': 'v1/chat/completions',
  'mgtv-storyboard': 'openapi/v1/storyboard/generateByPromptV2',
  'agnes-image': 'v1/images/generations',
}

function ok(data) {
  return { ok: true, data }
}

function fail(error) {
  return { ok: false, error }
}

module.exports = { protocolDefaults, ok, fail }
