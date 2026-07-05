function validateGenerationInput(input) {
  const minDimension = input.mode === 'icon' ? 16 : 128
  if (!input.prompt || !input.prompt.trim()) throw new Error('请输入正向提示词')
  const isVideoMode = input.mode === 'txt2video' || input.mode === 'img2video'
  if (!input.modelId || !input.modelId.trim()) throw new Error(isVideoMode ? '请选择视频模型' : '请选择图像模型')
  if (!Number.isFinite(input.width) || input.width < minDimension || input.width > 4096) throw new Error(`宽度必须在 ${minDimension} 到 4096 之间`)
  if (!Number.isFinite(input.height) || input.height < minDimension || input.height > 4096) throw new Error(`高度必须在 ${minDimension} 到 4096 之间`)
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 10) throw new Error('批量数量必须在 1 到 10 之间')
  if (!Number.isInteger(input.steps) || input.steps < 1 || input.steps > 80) throw new Error('生成步数必须在 1 到 80 之间')
  if (input.mode === 'img2img' && !input.referenceImage) throw new Error('图生图需要先上传参考图')
  if (input.mode === 'img2video' && !input.referenceImage) throw new Error('图生视频需要先上传参考图')
}

module.exports = { validateGenerationInput }
