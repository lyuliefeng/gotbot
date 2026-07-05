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
assert(!appJson.permission?.['scope.writePhotosAlbum'], 'app.json must not declare invalid scope.writePhotosAlbum permission')
const catalogSource = fs.readFileSync(path.join(root, 'utils/catalog.js'), 'utf8')
assert((catalogSource.match(/id: 'prompt-/g) || []).length >= 18, 'catalog.js must provide expanded built-in prompt scenarios')
assert(catalogSource.includes('const defaultModels = []'), 'catalog.js must not ship built-in API upstreams or default models')
for (const scene of ['电商主图', '美食摄影', '旅行风景', '人像写真', '室内设计', '视频分镜']) {
  assert(catalogSource.includes(scene), `catalog.js must include prompt scene: ${scene}`)
}

for (const page of appJson.pages) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    exists(path.join(root, `${page}.${ext}`))
  }
  const pageJs = fs.readFileSync(path.join(root, `${page}.js`), 'utf8')
  const pageWxml = fs.readFileSync(path.join(root, `${page}.wxml`), 'utf8')
  assert(pageJs.includes('Page({') || pageJs.includes('Page ( {'), `${page}.js must register a Page`) 
  for (const match of pageWxml.matchAll(/(?:bind|catch)(?:tap|input|change)="([^"]+)"/g)) {
    const handler = match[1]
    assert(new RegExp(`${handler}\\s*\\(`).test(pageJs), `${page}.wxml binds ${handler}, but ${page}.js does not define it`)
  }
  assertSimpleWxmlBindings(page, pageWxml)
  assert(!pageWxml.includes('undefined'), `${page}.wxml should not include literal undefined`)
}

const tabPages = new Set((appJson.tabBar?.list || []).map((item) => item.pagePath))
for (const required of ['pages/learning/index', 'pages/materials/index', 'pages/realtime-scan/index', 'pages/profile/index']) {
  assert(tabPages.has(required), `tabBar must include ${required}`)
}
assert(appJson.window?.navigationBarTitleText === '问课本', 'app title must reflect the textbook AI learning app')
assert(appJson.permission?.['scope.camera']?.desc, 'app.json must explain camera permission for realtime question scanning')

for (const fn of ['login', 'modelProfiles', 'generationTasks', 'promptPacks', 'promptPolish']) {
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

{
  const fn = 'realtimeScan'
  const entry = path.join(cloudRoot, fn, 'index.js')
  const pkg = path.join(cloudRoot, fn, 'package.json')
  exists(entry)
  exists(pkg)
  for (const commonFile of ['db.js', 'types.js']) {
    exists(path.join(cloudRoot, fn, 'common', commonFile))
  }
  const source = fs.readFileSync(entry, 'utf8')
  assert(source.includes('exports.main'), 'realtimeScan/index.js must export exports.main')
  for (const action of ['startSession', 'pushFrame', 'ask', 'saveMistake', 'endSession']) {
    assert(source.includes(action), `realtimeScan must support ${action}`)
  }
  const packageJson = readJson(pkg)
  assert(packageJson.dependencies && packageJson.dependencies['wx-server-sdk'], 'realtimeScan/package.json must depend on wx-server-sdk')
}

for (const util of ['assets.js', 'catalog.js', 'cloud.js', 'state.js', 'validators.js']) {
  exists(path.join(root, 'utils', util))
}
exists(path.join(root, 'scripts/smoke-settings-third-party-api.cjs'))

const settingsSource = fs.readFileSync(path.join(root, 'pages/settings/index.js'), 'utf8')
const settingsWxml = fs.readFileSync(path.join(root, 'pages/settings/index.wxml'), 'utf8')
assert(settingsSource.includes('hydrateModelsFromState()'), 'settings page must hydrate models from local state')
assert(!/onShow\(\)\s*{[^}]*refreshDefaultProvider\(\)/.test(settingsSource), 'settings page must not refresh remote models on every onShow')
assert(settingsSource.includes('openModelSettings()'), 'settings page must expose a modal model settings entry')
assert(settingsSource.includes('noop()'), 'settings page must stop modal panel taps from closing the popup')
assert(settingsSource.includes('settingsVisibleModels'), 'settings page must filter model rows before rendering')
assert(settingsSource.includes('isBuiltinDefaultGroup'), 'settings page must identify built-in default model groups')
assert(settingsSource.includes('modelsMatchingKind'), 'settings page must filter discovered models by the selected model type')
assert(settingsWxml.includes('settings-modal-mask'), 'settings page must render model configuration in a popup mask')
assert(settingsWxml.includes('catchtap="closeForm"'), 'settings popup mask must close when tapping outside')
assert(settingsWxml.includes('catchtap="noop"'), 'settings popup panel must stop outside-close propagation')
assert(!settingsWxml.includes('默认配置'), 'settings modal must not show default API configuration card')
assert(!settingsWxml.includes('{{defaultProviderEndpoint}}'), 'settings modal must not show the default API address')
assert(settingsWxml.includes('第三方 API'), 'settings modal must restore a dedicated third-party API module')
assert(settingsWxml.includes('模型类型开关'), 'settings modal must merge image/LLM add actions into one type control')
assert(settingsWxml.includes('data-field="endpoint"'), 'third-party API module must show endpoint input')
assert(settingsWxml.includes('data-field="apiKey"'), 'third-party API module must show API key input')
assert(settingsWxml.includes('bindchange="onKindChange"'), 'settings third-party API module must switch selected model type')
assert(settingsWxml.includes('扫描第三方 API'), 'third-party API module must scan third-party models')
assert(!settingsWxml.includes('添加生图模型'), 'settings page must not keep separate image add action')
assert(!settingsWxml.includes('添加视频模型'), 'settings page must not keep separate video add action')
assert(!settingsWxml.includes('添加文字模型'), 'settings page must not keep separate text add action')
assert(settingsWxml.includes('视频模型'), 'settings page must keep video model type in the unified configuration popup')
assert(settingsSource.includes('apiProtocolForKind'), 'settings page must map API protocol by selected model type')
assert(settingsSource.includes('apiPathForKind'), 'settings page must map API path by selected model type')
assert(catalogSource.includes('txt2video'), 'workspace catalog must expose text-to-video generation')
assert(catalogSource.includes('img2video'), 'workspace catalog must expose image-to-video generation')
assert(!catalogSource.includes('openai-gpt-image-2'), 'default model catalog must not include GPT Image 2')
assert(!settingsWxml.includes('bindchange="onNameModeChange"'), 'settings page must not show a duplicate name picker')
assert(!settingsWxml.includes('class="section form-panel"'), 'settings page must not render model configuration as an inline form panel')
assert(!settingsWxml.includes('已配置模型'), 'settings page must not render a duplicate configured model section below the popup entry')
assert(!settingsWxml.includes('model-list'), 'settings page must not render a duplicate configured model list')
assert(!settingsWxml.includes('model-card'), 'settings page must not render configured model cards outside the popup')
assert(!settingsWxml.includes('暂无默认模型'), 'settings page empty state must not show default model wording')
const workspaceSource = fs.readFileSync(path.join(root, 'pages/workspace/index.js'), 'utf8')
assert(workspaceSource.includes('4096 x 4096'), 'workspace resolution picker must include GPT 4K size')
assert(workspaceSource.includes('AUTO_MODEL_ID'), 'workspace model picker must include an auto-match option')
assert(workspaceSource.includes('MANUAL_MODEL_PREFIX'), 'workspace model picker must label matched model choices as manual selection')
assert(workspaceSource.includes('manualModelEnabled'), 'workspace model picker must expose an auto/manual match switch state')
assert(workspaceSource.includes('onModelMatchModeChange'), 'workspace model picker must handle auto/manual match switch changes')
assert(workspaceSource.includes('includePlatform: true'), 'workspace manual model picker must include platform Agnes models')
assert(workspaceSource.includes('isHiddenManualModel'), 'workspace manual model picker must hide default model groups')
assert(workspaceSource.includes('modelIndex: 0'), 'workspace model picker must default to the auto-match option')
assert(workspaceSource.includes('selectedModelKindLabel'), 'workspace model picker must expose recognized model kind labels')
assert(workspaceSource.includes('defaultModelKey(modelKind)'), 'workspace generation must use the matched default model in auto mode')
const workspaceWxml = fs.readFileSync(path.join(root, 'pages/workspace/index.wxml'), 'utf8')
assert(workspaceWxml.includes('匹配方式'), 'workspace composer must show the auto/manual match switch label')
assert(workspaceWxml.includes('switch checked="{{manualModelEnabled}}"'), 'workspace composer must render an auto/manual match switch')
assert(workspaceWxml.includes('wx:if="{{manualModelEnabled}}"'), 'workspace composer must only show manual model picker in manual mode')
exists(path.join(root, 'scripts/smoke-workspace-model-picker.cjs'))

const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
assert(appSource.includes('cloudReady'), 'app.js must expose cloud availability')
const cloudSource = fs.readFileSync(path.join(root, 'utils/cloud.js'), 'utf8')
assert(cloudSource.includes('wx.cloud.init'), 'utils/cloud.js must initialize wx.cloud before cloud calls')
assert(cloudSource.includes('traceUser: false'), 'utils/cloud.js must not enable CloudBase traceUser during simulator startup')
const generationTasksSource = fs.readFileSync(path.join(cloudRoot, 'generationTasks/index.js'), 'utf8')
assert(generationTasksSource.includes('请先配置第三方 API 模型'), 'generationTasks must reject generation without a user-configured model')
assert(!generationTasksSource.includes('fallbackImage'), 'generationTasks must not keep built-in image fallback')
assert(!generationTasksSource.includes('fallbackVideo'), 'generationTasks must not keep built-in video fallback')
assert(!generationTasksSource.includes('视频生成已关闭'), 'generationTasks must not reject video generation modes')

const projectPrivate = path.join(root, 'project.private.config.json')
if (fs.existsSync(projectPrivate)) readJson(projectPrivate)

console.log('WeChat mini-program project structure verified.')
