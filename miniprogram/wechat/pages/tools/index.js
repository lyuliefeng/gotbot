const { tools, modeLabels } = require('../../utils/catalog')

const toolCards = tools.map((tool) => ({ ...tool, modeLabel: modeLabels[tool.mode] || tool.mode }))

Page({
  data: { tools: toolCards },
  goWorkspace() {
    wx.switchTab({ url: '/pages/workspace/index' })
  },
})
