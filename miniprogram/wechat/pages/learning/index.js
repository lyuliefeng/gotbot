Page({
  data: {
    cards: [
      { id: 'continue', title: '继续学习', desc: '七年级数学 · 一次函数', action: '进入章节' },
      { id: 'scan', title: '视频答题', desc: '打开摄像头，对准题目实时讲解', action: '开始扫题' },
      { id: 'mistakes', title: '错题复习', desc: '回看已保存的错题和薄弱点', action: '查看错题' },
    ],
    stats: [
      { id: 'days', label: '连续学习', value: '0 天' },
      { id: 'questions', label: '已答题', value: '0 道' },
      { id: 'mistake', label: '待复习', value: '0 题' },
    ],
  },

  openScan() {
    wx.switchTab({ url: '/pages/realtime-scan/index' })
  },

  openMaterials() {
    wx.switchTab({ url: '/pages/materials/index' })
  },
})
