import type { GeneratedAsset } from '@/types'

export function isWechatRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.wx)
}

export async function chooseImage(): Promise<string | null> {
  if (!isWechatRuntime()) return null
  return null
}

export async function saveAssetToAlbum(asset: GeneratedAsset): Promise<void> {
  if (!asset.remoteUrl && !asset.dataUrl) throw new Error('当前资源没有可保存的文件地址')
}

export async function shareAsset(asset: GeneratedAsset): Promise<void> {
  if (!asset.remoteUrl && !asset.dataUrl) throw new Error('当前资源没有可分享的文件地址')
}
