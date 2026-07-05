let wxServer = null

try {
  wxServer = require('wx-server-sdk')
  wxServer.init({ env: wxServer.DYNAMIC_CURRENT_ENV })
} catch {
  wxServer = null
}

const memory = {
  users: [],
  modelProfiles: [],
  generationTasks: [],
  promptPacks: [],
  realtime_sessions: [],
  frame_snapshots: [],
  scan_answers: [],
  student_records: [],
}

function hasCloudDb() {
  return Boolean(wxServer && wxServer.database)
}

async function list(collection, predicate = () => true) {
  if (!hasCloudDb()) return memory[collection].filter(predicate)
  const result = await wxServer.database().collection(collection).where({}).get()
  return result.data.filter(predicate)
}

async function upsert(collection, matcher, value) {
  if (!hasCloudDb()) {
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

async function remove(collection, matcher) {
  if (!hasCloudDb()) {
    const before = memory[collection].length
    memory[collection] = memory[collection].filter((item) => !matcher(item))
    return before !== memory[collection].length
  }

  const db = wxServer.database()
  const matches = await list(collection, matcher)
  await Promise.all(matches.filter((item) => item._id).map((item) => db.collection(collection).doc(item._id).remove()))
  return matches.length > 0
}

function getWxServer() {
  return wxServer
}

module.exports = { list, upsert, remove, getWxServer }
