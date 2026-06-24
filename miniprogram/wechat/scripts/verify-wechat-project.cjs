const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const cloudRoot = path.resolve(root, '../cloudfunctions')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function exists(file) {
  assert(fs.existsSync(file), `Missing required file: ${path.relative(root, file)}`)
}

function assertSimpleWxmlBindings(page, pageWxml) {
  const riskyPatterns = [
    { pattern: /\?/, label: 'ternary expression' },
    { pattern: /===|!==/, label: 'strict equality expression' },
    { pattern: /&&|\|\|/, label: 'logical expression' },
    { pattern: /\[[^\]]+\]/, label: 'array or object index expression' },
    { pattern: /![\w(]/, label: 'negation expression' },
  ]

  for (const match of pageWxml.matchAll(/\{\{([^}]*)\}\}/g)) {
    const expression = match[1]
    for (const risky of riskyPatterns) {
      assert(!risky.pattern.test(expression), `${page}.wxml contains ${risky.label}: {{${expression}}}`)
    }
  }
}

exists(path.join(root, 'project.config.json'))
exists(path.join(root, 'app.json'))
exists(path.join(root, 'app.js'))
exists(path.join(root, 'app.wxss'))

const projectConfig = readJson(path.join(root, 'project.config.json'))
assert(projectConfig.compileType === 'miniprogram', 'project.config.json compileType must be miniprogram')
assert(projectConfig.cloudfunctionRoot === '../cloudfunctions/', 'project.config.json cloudfunctionRoot must point to ../cloudfunctions/')

const appJson = readJson(path.join(root, 'app.json'))
assert(Array.isArray(appJson.pages) && appJson.pages.length >= 6, 'app.json must declare all first-version pages')

for (const page of appJson.pages) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    exists(path.join(root, `${page}.${ext}`))
  }
  const pageJs = fs.readFileSync(path.join(root, `${page}.js`), 'utf8')
  const pageWxml = fs.readFileSync(path.join(root, `${page}.wxml`), 'utf8')
  assert(pageJs.includes('Page({') || pageJs.includes('Page ( {'), `${page}.js must register a Page`) 
  for (const match of pageWxml.matchAll(/bind(?:tap|input|change)="([^"]+)"/g)) {
    const handler = match[1]
    assert(new RegExp(`${handler}\\s*\\(`).test(pageJs), `${page}.wxml binds ${handler}, but ${page}.js does not define it`)
  }
  assertSimpleWxmlBindings(page, pageWxml)
  assert(!pageWxml.includes('undefined'), `${page}.wxml should not include literal undefined`)
}

const tabPages = new Set((appJson.tabBar?.list || []).map((item) => item.pagePath))
for (const required of ['pages/workspace/index', 'pages/assets/index', 'pages/tools/index', 'pages/settings/index']) {
  assert(tabPages.has(required), `tabBar must include ${required}`)
}

for (const fn of ['login', 'modelProfiles', 'generationTasks', 'promptPacks']) {
  const entry = path.join(cloudRoot, fn, 'index.js')
  const pkg = path.join(cloudRoot, fn, 'package.json')
  exists(entry)
  exists(pkg)
  for (const commonFile of ['crypto.js', 'db.js', 'generation-service.js', 'types.js']) {
    exists(path.join(cloudRoot, fn, 'common', commonFile))
  }
  const source = fs.readFileSync(entry, 'utf8')
  assert(source.includes('exports.main'), `${fn}/index.js must export exports.main`)
  assert(!source.includes('export async function'), `${fn}/index.js must use CommonJS for WeChat cloud functions`)
  assert(!source.includes("require('../common/"), `${fn}/index.js must be self-contained and require ./common/*`)
  const packageJson = readJson(pkg)
  assert(packageJson.dependencies && packageJson.dependencies['wx-server-sdk'], `${fn}/package.json must depend on wx-server-sdk`)
}

for (const util of ['assets.js', 'catalog.js', 'cloud.js', 'state.js', 'validators.js']) {
  exists(path.join(root, 'utils', util))
}

const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
assert(appSource.includes('wx.cloud.init'), 'app.js must initialize wx.cloud')

const projectPrivate = path.join(root, 'project.private.config.json')
if (fs.existsSync(projectPrivate)) readJson(projectPrivate)

console.log('WeChat mini-program project structure verified.')
