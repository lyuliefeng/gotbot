const { callFunction } = require('../../utils/cloud')

const SAMPLE_INTERVAL_MS = 2000
const MODES = [
  { id: 'explain', label: '看题讲解' },
  { id: 'hint', label: '只给提示' },
  { id: 'grade', label: '直接批改' },
  { id: 'similar', label: '生成同类题' },
]

Page({
  data: {
    grades: ['小学五年级', '小学六年级', '初一', '初二', '初三', '高一', '高二', '高三'],
    subjects: ['数学', '语文', '英语', '物理', '化学', '生物'],
    textbooks: ['人教版', '苏教版', '北师大版', '通用教材'],
    gradeIndex: 2,
    subjectIndex: 0,
    textbookIndex: 0,
    selectedGrade: '初一',
    selectedSubject: '数学',
    selectedTextbook: '人教版',
    modes: MODES.map((item, index) => ({ ...item, activeClass: index === 0 ? 'active' : '' })),
    mode: 'explain',
    modeLabel: '看题讲解',
    sessionId: '',
    sessionActive: false,
    paused: false,
    cameraReady: false,
    cameraReadyText: '等待相机授权',
    scanStatus: '点击开始后，对准课本、试卷或手写题',
    detectedQuestion: '尚未识别题目',
    confidenceText: '置信度 --',
    answer: '',
    citationsText: '暂无教材引用',
    questionText: '',
    error: '',
    saving: false,
    starting: false,
    asking: false,
    scanning: false,
    pauseButtonText: '暂停识别',
    startButtonText: '开始实时答题',
    lastAnswerId: '',
    currentFrameFileId: '',
  },

  onUnload() {
    this.stopSampling()
    if (this.data.sessionId) {
      void callFunction('realtimeScan', { action: 'endSession', sessionId: this.data.sessionId })
    }
  },

  onGradeChange(event) {
    const index = Number(event.detail.value)
    this.setData({ gradeIndex: index, selectedGrade: this.data.grades[index] })
  },

  onSubjectChange(event) {
    const index = Number(event.detail.value)
    this.setData({ subjectIndex: index, selectedSubject: this.data.subjects[index] })
  },

  onTextbookChange(event) {
    const index = Number(event.detail.value)
    this.setData({ textbookIndex: index, selectedTextbook: this.data.textbooks[index] })
  },

  onQuestionInput(event) {
    this.setData({ questionText: event.detail.value })
  },

  onCameraReady() {
    this.setData({ cameraReady: true, cameraReadyText: '相机已就绪' })
  },

  onCameraError(event) {
    const message = event.detail && event.detail.errMsg ? event.detail.errMsg : '相机不可用'
    this.setData({ error: message, cameraReadyText: '相机不可用' })
  },

  selectMode(event) {
    const mode = event.currentTarget.dataset.mode
    const selected = MODES.find((item) => item.id === mode) || MODES[0]
    this.setData({
      mode: selected.id,
      modeLabel: selected.label,
      modes: MODES.map((item) => ({ ...item, activeClass: item.id === selected.id ? 'active' : '' })),
    })
  },

  async startSession() {
    if (this.data.starting) return
    try {
      this.setData({ starting: true, error: '', scanStatus: '正在创建视频答题会话' })
      const result = await callFunction('realtimeScan', {
        action: 'startSession',
        grade: this.data.selectedGrade,
        subject: this.data.selectedSubject,
        textbookId: this.data.selectedTextbook,
      })
      this.setData({
        sessionId: result.sessionId,
        sessionActive: true,
        paused: false,
        startButtonText: '重新开始',
        pauseButtonText: '暂停识别',
        scanStatus: '正在看题',
      })
      this.startSampling()
      return true
    } catch (error) {
      this.setData({ error: error.message || '创建会话失败', scanStatus: '会话创建失败' })
      return false
    } finally {
      this.setData({ starting: false })
    }
  },

  togglePause() {
    const paused = !this.data.paused
    this.setData({
      paused,
      pauseButtonText: paused ? '继续识别' : '暂停识别',
      scanStatus: paused ? '已暂停识别' : '正在看题',
    })
    if (paused) this.stopSampling()
    else this.startSampling()
  },

  startSampling() {
    this.stopSampling()
    if (!this.data.sessionActive || this.data.paused) return
    this.sampleTimer = setInterval(() => {
      void this.captureAndPushFrame(false)
    }, SAMPLE_INTERVAL_MS)
    void this.captureAndPushFrame(false)
  },

  stopSampling() {
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer)
      this.sampleTimer = null
    }
  },

  capturePhoto() {
    return new Promise((resolve, reject) => {
      const camera = wx.createCameraContext()
      camera.takePhoto({
        quality: 'low',
        success: (res) => resolve(res.tempImagePath),
        fail: reject,
      })
    })
  },

  uploadFrame(filePath) {
    return new Promise((resolve, reject) => {
      const cloudPath = `realtime-scan/${this.data.sessionId}/${Date.now()}.jpg`
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: (res) => resolve(res.fileID),
        fail: reject,
      })
    })
  },

  async captureAndPushFrame(forceAsk) {
    if (!this.data.sessionId || this.data.paused || this.data.scanning) return
    try {
      this.setData({ scanning: true, error: '', scanStatus: '识别题干' })
      const filePath = await this.capturePhoto()
      const cloudFileId = await this.uploadFrame(filePath)
      const timestamp = Date.now()
      const frameHash = `${cloudFileId}:${timestamp}`
      const result = await callFunction('realtimeScan', {
        action: 'pushFrame',
        sessionId: this.data.sessionId,
        cloudFileId,
        frameHash,
        timestamp,
      })
      this.setData({
        currentFrameFileId: cloudFileId,
        detectedQuestion: result.detectedQuestion,
        confidenceText: `置信度 ${Math.round(result.confidence * 100)}%`,
        scanStatus: result.statusText,
      })
      if (forceAsk) await this.askQuestion()
    } catch (error) {
      this.setData({
        error: error.message || '关键帧上传失败',
        scanStatus: '请靠近题目、补光或横屏后重试',
      })
    } finally {
      this.setData({ scanning: false })
    }
  },

  async askQuestion() {
    if (!this.data.sessionId || this.data.asking) return
    try {
      this.setData({ asking: true, error: '', scanStatus: '生成讲解' })
      const result = await callFunction('realtimeScan', {
        action: 'ask',
        sessionId: this.data.sessionId,
        questionText: this.data.questionText,
        mode: this.data.mode,
      })
      this.setData({
        answer: result.answer,
        citationsText: result.citationsText,
        lastAnswerId: result.answerId,
        scanStatus: '讲解已生成',
      })
    } catch (error) {
      this.setData({ error: error.message || '生成回答失败', scanStatus: '生成失败' })
    } finally {
      this.setData({ asking: false })
    }
  },

  async askWithLatestFrame() {
    if (!this.data.sessionId) {
      const started = await this.startSession()
      if (!started) return
    }
    await this.captureAndPushFrame(true)
  },

  async saveMistake() {
    if (!this.data.sessionId || !this.data.lastAnswerId || this.data.saving) return
    try {
      this.setData({ saving: true, error: '' })
      await callFunction('realtimeScan', {
        action: 'saveMistake',
        sessionId: this.data.sessionId,
        answerId: this.data.lastAnswerId,
        studentAnswer: this.data.questionText,
      })
      wx.showToast({ title: '已保存错题', icon: 'success' })
    } catch (error) {
      this.setData({ error: error.message || '保存错题失败' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
