Page({
  data: {
    stages: ['小学', '初中', '高中'],
    subjects: ['数学', '语文', '英语', '物理', '化学'],
    stageIndex: 1,
    subjectIndex: 0,
    selectedStage: '初中',
    selectedSubject: '数学',
    textbooks: [
      { id: 'math-7-a', title: '七年级数学上册', version: '人教版', chapters: 8, status: '示例教材' },
      { id: 'math-8-a', title: '八年级数学上册', version: '人教版', chapters: 10, status: '待导入' },
      { id: 'physics-8-a', title: '八年级物理上册', version: '人教版', chapters: 6, status: '待导入' },
    ],
    chapters: [
      { id: 'c1', title: '第一章 有理数', desc: '数轴、相反数、绝对值、有理数运算' },
      { id: 'c2', title: '第二章 整式的加减', desc: '单项式、多项式、合并同类项' },
      { id: 'c3', title: '第三章 一元一次方程', desc: '方程建模、解方程、应用题' },
    ],
  },

  onStageChange(event) {
    const index = Number(event.detail.value)
    this.setData({ stageIndex: index, selectedStage: this.data.stages[index] })
  },

  onSubjectChange(event) {
    const index = Number(event.detail.value)
    this.setData({ subjectIndex: index, selectedSubject: this.data.subjects[index] })
  },

  openScan() {
    wx.switchTab({ url: '/pages/realtime-scan/index' })
  },
})
