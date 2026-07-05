function getDirectAssetUrl(asset) {
  return asset.assetUrl || asset.remoteUrl || asset.dataUrl || ''
}

async function resolveAssetUrls(assets) {
  const nextAssets = (assets || []).map((asset) => ({ ...asset, assetUrl: getDirectAssetUrl(asset) }))
  const cloudAssets = nextAssets.filter((asset) => !asset.assetUrl && asset.cloudFileId)
  if (!cloudAssets.length || !wx.cloud || !wx.cloud.getTempFileURL) return nextAssets

  const result = await wx.cloud.getTempFileURL({ fileList: cloudAssets.map((asset) => asset.cloudFileId) })
  const urlByFileId = (result.fileList || []).reduce((map, item) => {
    if (item.fileID && item.tempFileURL) map[item.fileID] = item.tempFileURL
    return map
  }, {})

  return nextAssets.map((asset) => ({ ...asset, assetUrl: asset.assetUrl || urlByFileId[asset.cloudFileId] || '' }))
}

async function resolveTaskAssetUrls(tasks) {
  return Promise.all((tasks || []).map(async (task) => ({ ...task, assets: await resolveAssetUrls(task.assets || []) })))
}

module.exports = { resolveAssetUrls, resolveTaskAssetUrls }
