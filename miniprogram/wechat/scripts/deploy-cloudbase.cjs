const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const crypto = require('node:crypto')

const outputRoot = path.join('/tmp', 'gotbot-cloudfunctions-bundled')
const deployRoot = path.join('/tmp', 'gotbot-cloudbase-deploy')
const envId = process.env.CLOUDBASE_ENV_ID || 'cloud1-d5g01k4t5decfcc5c'
const platformKey = process.env.PLATFORM_IMAGE_API_KEY || ''
const platformSecret = process.env.PLATFORM_IMAGE_API_SECRET || ''
const secret = process.env.GOTBOT_MINIPROGRAM_SECRET || crypto.randomBytes(32).toString('hex')

if (!platformKey) {
  console.error('Missing PLATFORM_IMAGE_API_KEY')
  process.exit(1)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) process.exit(result.status || 1)
}

run(process.execPath, [path.join(__dirname, 'build-cloudfunction-bundles.cjs'), outputRoot])

fs.rmSync(deployRoot, { recursive: true, force: true })
fs.mkdirSync(deployRoot, { recursive: true })
fs.cpSync(outputRoot, path.join(deployRoot, 'functions'), { recursive: true })

const functions = [
  { name: 'login', timeout: 5 },
  { name: 'modelProfiles', timeout: 10 },
  { name: 'generationTasks', timeout: 300 },
  { name: 'promptPacks', timeout: 10 },
]

fs.writeFileSync(path.join(deployRoot, 'cloudbaserc.json'), JSON.stringify({
  $schema: 'https://static.cloudbase.net/cli/cloudbaserc.schema.json',
  envId,
  functionRoot: 'functions',
  functions: functions.map((item) => ({
    name: item.name,
    runtime: 'Nodejs16.13',
    handler: 'index.main',
    timeout: item.timeout,
    envVariables: {
      PLATFORM_IMAGE_API_KEY: platformKey,
      PLATFORM_IMAGE_API_SECRET: platformSecret,
      GOTBOT_MINIPROGRAM_SECRET: secret,
    },
  })),
}, null, 2))

run('npx', ['-y', '-p', '@cloudbase/cli@latest', 'cloudbase', 'fn', 'deploy', '--all', '--force', '--config-file', path.join(deployRoot, 'cloudbaserc.json')], { cwd: deployRoot })

console.log(`Cloud functions deployed to ${envId}`)
