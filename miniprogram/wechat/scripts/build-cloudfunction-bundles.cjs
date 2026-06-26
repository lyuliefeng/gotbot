const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const sourceRoot = path.join(root, 'cloudfunctions')
const outputRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join('/tmp', 'gotbot-cloudfunctions-bundled')

const functions = ['login', 'modelProfiles', 'generationTasks', 'promptPacks', 'promptPolish']
const modules = [
  'common/crypto.js',
  'common/db.js',
  'common/generation-service.js',
  'common/platform-keys.js',
  'common/types.js',
]

function read(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function bundle(functionName) {
  const moduleEntries = modules.map((relativePath) => {
    const moduleId = `./${relativePath}`
    return `${JSON.stringify(moduleId)}: function(require, module, exports) {\n${read(relativePath)}\n}`
  })

  const entrySource = read(`${functionName}/index.js`)
  return `const __modules = {\n${moduleEntries.join(',\n')}\n}\n\nconst __cache = {}\nfunction __makeRequire(parentId) {\n  return function __localRequire(id) {\n    let normalized\n    if (id.startsWith('./common/')) normalized = id.endsWith('.js') ? id : id + '.js'\n    else if (parentId && parentId.startsWith('./common/') && id.startsWith('./')) normalized = './common/' + id.slice(2).replace(/\\.js$/, '') + '.js'\n    else return require(id)\n    if (!__modules[normalized]) throw new Error('Bundled module not found: ' + normalized)\n    if (!__cache[normalized]) {\n      const module = { exports: {} }\n      __cache[normalized] = module\n      __modules[normalized](__makeRequire(normalized), module, module.exports)\n    }\n    return __cache[normalized].exports\n  }\n}\n\nconst __entry = { exports: {} }\n;(function(require, module, exports) {\n${entrySource}\n})(__makeRequire(null), __entry, __entry.exports)\n\nexports.main = __entry.exports.main\n`
}

fs.rmSync(outputRoot, { recursive: true, force: true })
fs.mkdirSync(outputRoot, { recursive: true })

for (const functionName of functions) {
  const target = path.join(outputRoot, functionName)
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'index.js'), bundle(functionName))
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
    name: functionName,
    version: '1.0.0',
    main: 'index.js',
    dependencies: { 'wx-server-sdk': 'latest' },
  }, null, 2))
  const configPath = path.join(sourceRoot, functionName, 'config.json')
  if (fs.existsSync(configPath)) fs.copyFileSync(configPath, path.join(target, 'config.json'))
}

console.log(`Bundled cloud functions written to ${outputRoot}`)
