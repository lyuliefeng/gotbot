function normalizeAvailableModels(profile) {
  const available = Array.isArray(profile.availableModels) ? profile.availableModels : []
  const selected = Array.isArray(profile.selectedModels) && profile.selectedModels.length
    ? profile.selectedModels
    : available.map((model) => model.id || model.name).filter(Boolean)
  const selectedSet = new Set(selected)
  return available.filter((model) => selectedSet.has(model.id) || selectedSet.has(model.name)).map((model) => ({
    ...profile,
    id: `${profile.id || profile.model}-${model.id || model.name}`,
    parentModelProfileId: profile.id,
    name: model.name || model.id,
    model: model.id || model.name,
    kind: model.kind || profile.kind || 'image',
    sourceType: profile.sourceType || 'api-switch-discovery',
  }))
}

function expandModelProfiles(profiles) {
  const expanded = []
  for (const profile of profiles || []) {
    const discovered = normalizeAvailableModels(profile)
    if (discovered.length) expanded.push(...discovered)
    else expanded.push(profile)
  }
  return expanded
}

module.exports = { expandModelProfiles, normalizeAvailableModels }
