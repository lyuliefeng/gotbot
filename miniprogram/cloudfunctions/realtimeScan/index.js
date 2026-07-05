const { list, upsert } = require('./common/db')
const { fail, ok } = require('./common/types')

const MODE_LABELS = {
  explain: '看题讲解',
  hint: '只给提示',
  grade: '直接批改',
  similar: '生成同类题',
}

function resolveOpenid(context) {
  const openid = context.OPENID
  if (!openid) throw new Error('认证失败：无法获取用户身份')
  return openid
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function normalizeText(value, fallback) {
  const text = String(value || '').trim()
  return text || fallback
}

function resolveSession(openid, sessionId) {
  return list('realtime_sessions', (item) => item.id === sessionId && item.openid === openid)
    .then((items) => {
      const session = items[0]
      if (!session) throw new Error('视频答题会话不存在或已过期')
      return session
    })
}

function inferQuestion(session, event) {
  const subject = normalizeText(session.subject, '数学')
  const grade = normalizeText(session.grade, '初一')
  if (event.ocrText) return String(event.ocrText).slice(0, 220)
  if (subject.includes('数学')) return `我看到这像是一道${grade}${subject}题，可能涉及方程、函数或几何关系。`
  if (subject.includes('英语')) return `我看到这像是一道${grade}${subject}题，可能需要先理解题干和选项。`
  return `我看到这像是一道${grade}${subject}题，正在提取题干和关键条件。`
}

function statusTextForConfidence(confidence) {
  if (confidence >= 0.75) return '检索教材'
  if (confidence >= 0.55) return '题目已稳定，请追问或立即回答'
  return '请靠近题目、补光或横屏'
}

function answerForMode(mode, question, questionText, session) {
  const subject = normalizeText(session.subject, '数学')
  const modeLabel = MODE_LABELS[mode] || MODE_LABELS.explain
  const userQuestion = normalizeText(questionText, '请讲解这道题')
  const base = `我看到这是一道${session.grade || ''}${subject}题。${question}`

  if (mode === 'hint') {
    return `${base}\n\n提示：先圈出题干中的已知条件，再判断它对应教材里的哪个知识点。不要急着算最终答案，先写出关系式或关键词。`
  }

  if (mode === 'grade') {
    return `${base}\n\n批改建议：请把你的解题步骤写在输入框里。我会先检查关键条件是否用全，再判断推理和结果是否一致。当前回答基于画面关键帧，尚未接入真实手写识别服务。`
  }

  if (mode === 'similar') {
    return `${base}\n\n同类题：把题目中的数字或情境替换，但保留同一个知识点。你可以先做一题基础版，再做一题提高版。`
  }

  return `${base}\n\n${modeLabel}：\n1. 先读题，找出已知量和要求的问题。\n2. 把题目对应到教材知识点，写出公式、定义或关键句。\n3. 按步骤推导，最后检查答案是否符合题意。\n\n你的追问：${userQuestion}`
}

exports.main = async function main(event = {}, context = {}) {
  try {
    const openid = resolveOpenid(context)

    if (event.action === 'startSession') {
      const now = Date.now()
      const session = {
        id: createId('session'),
        openid,
        grade: normalizeText(event.grade, '初一'),
        subject: normalizeText(event.subject, '数学'),
        textbookId: normalizeText(event.textbookId, '通用教材'),
        chapterId: event.chapterId || '',
        startedAt: now,
        updatedAt: now,
        endedAt: null,
        status: 'active',
      }
      await upsert('realtime_sessions', (item) => item.id === session.id, session)
      return ok({ sessionId: session.id, status: session.status })
    }

    if (event.action === 'pushFrame') {
      if (!event.sessionId) throw new Error('缺少 sessionId')
      if (!event.cloudFileId) throw new Error('缺少关键帧文件')
      const session = await resolveSession(openid, event.sessionId)
      const confidence = event.ocrText ? 0.82 : 0.64
      const detectedQuestion = inferQuestion(session, event)
      const snapshot = {
        id: createId('frame'),
        openid,
        sessionId: session.id,
        cloudFileId: event.cloudFileId,
        frameHash: event.frameHash || '',
        timestamp: Number(event.timestamp || Date.now()),
        detectedQuestion,
        confidence,
        createdAt: Date.now(),
      }
      await upsert('frame_snapshots', (item) => item.id === snapshot.id, snapshot)
      await upsert('realtime_sessions', (item) => item.id === session.id, {
        ...session,
        latestQuestion: detectedQuestion,
        latestFrameId: snapshot.id,
        updatedAt: Date.now(),
      })
      return ok({
        status: 'recognized',
        statusText: statusTextForConfidence(confidence),
        detectedQuestion,
        confidence,
        frameId: snapshot.id,
      })
    }

    if (event.action === 'ask') {
      if (!event.sessionId) throw new Error('缺少 sessionId')
      const session = await resolveSession(openid, event.sessionId)
      const question = session.latestQuestion || '当前画面还没有稳定识别到题干。'
      const answer = answerForMode(event.mode || 'explain', question, event.questionText, session)
      const answerRecord = {
        id: createId('answer'),
        openid,
        sessionId: session.id,
        mode: event.mode || 'explain',
        questionText: event.questionText || '',
        answer,
        citations: [
          {
            source: session.textbookId || '通用教材',
            chapter: session.chapterId || '未匹配具体章节',
            evidence: session.latestQuestion ? '来自当前视频关键帧识别结果' : '未识别到稳定教材依据',
          },
        ],
        createdAt: Date.now(),
      }
      await upsert('scan_answers', (item) => item.id === answerRecord.id, answerRecord)
      return ok({
        answerId: answerRecord.id,
        answer,
        citations: answerRecord.citations,
        citationsText: `${answerRecord.citations[0].source} · ${answerRecord.citations[0].chapter}`,
        suggestedActions: ['保存错题', '生成同类题', '继续追问'],
      })
    }

    if (event.action === 'saveMistake') {
      if (!event.sessionId || !event.answerId) throw new Error('缺少会话或回答 ID')
      const session = await resolveSession(openid, event.sessionId)
      const answers = await list('scan_answers', (item) => item.id === event.answerId && item.openid === openid)
      if (!answers[0]) throw new Error('回答不存在，无法保存错题')
      const record = {
        id: createId('mistake'),
        openid,
        type: 'realtime-scan-mistake',
        sessionId: session.id,
        answerId: event.answerId,
        subject: session.subject,
        grade: session.grade,
        studentAnswer: event.studentAnswer || '',
        createdAt: Date.now(),
      }
      await upsert('student_records', (item) => item.id === record.id, record)
      return ok({ recordId: record.id })
    }

    if (event.action === 'endSession') {
      if (!event.sessionId) throw new Error('缺少 sessionId')
      const session = await resolveSession(openid, event.sessionId)
      const endedAt = Date.now()
      await upsert('realtime_sessions', (item) => item.id === session.id, {
        ...session,
        endedAt,
        status: 'ended',
        updatedAt: endedAt,
      })
      return ok({
        sessionId: session.id,
        summary: '本次视频答题已结束，主动保存的题目会进入错题记录。',
      })
    }

    throw new Error('不支持的操作')
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'realtimeScan failed')
  }
}
