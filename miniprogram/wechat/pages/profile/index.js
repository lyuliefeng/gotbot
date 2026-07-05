Page({
  data: {
    profile: {
      name: '自学账号',
      level: '初中数学',
      summary: '学习记录会在教材问答、视频答题和错题保存后自动更新。',
    },
    records: [
      { id: 'r1', label: '视频答题', value: '0 次' },
      { id: 'r2', label: '错题本', value: '0 题' },
      { id: 'r3', label: '薄弱点', value: '暂未生成' },
    ],
    privacy: [
      '默认不长期保存原始视频帧',
      '只有主动保存的题目进入错题本',
      'AI 回答优先引用教材来源',
    ],
  },
})
