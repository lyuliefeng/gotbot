let wxServer = null

try {
  wxServer = require('wx-server-sdk')
  wxServer.init({ env: wxServer.DYNAMIC_CURRENT_ENV })
} catch {
  wxServer = null
}

const memory = {
  realtime_sessions: [],
  frame_snapshots: [],
  scan_answers: [],
  student_records: [],
}

function hasCloudDb() {
  return Boolean(wxServer && wxServer.database)
}

async function list(collection, predicate = () => true) {
  if (!hasCloudDb()) return (memory[collection] || []).filter(predicate)
  const result = await wxServer.database().collection(collection).where({}).get()
  return result.data.filter(predicate)
}

async function upsert(collection, matcher, value) {
  if (!hasCloudDb()) {
    if (!memory[collection]) memory[collection] = []
    const index = memory[collection].findIndex(matcher)
    if (index >= 0) {
      memory[collection][index] = { ...memory[collection][index], ...value }
      return memory[collection][index]
    }
    memory[collection].push(value)
    return value
  }

  const db = wxServer.database()
  const existing = await list(collection, matcher)
  if (existing[0]?._id) {
    await db.collection(collection).doc(existing[0]._id).update({ data: value })
    return { ...existing[0], ...value }
  }
  const addResult = await db.collection(collection).add({ data: value })
  return { ...value, _id: addResult._id }
}

module.exports = { list, upsert }
