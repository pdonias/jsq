const fs = require('fs').promises
const envPaths = require('env-paths').default
const path = require('path')

const paths = envPaths('jsq', { suffix: '' })

const cacheDir = paths.cache
const cacheFile = path.join(cacheDir, process.env.CACHE || 'cache.json')

const hasStdin = process.env.STDIN === undefined ? !process.stdin.isTTY : process.env.STDIN === '1'

module.exports = { debug, readStdin, fileExists, parse, readCache, writeCache, delCache, hasStdin }

function debug(...args) {
  if (process.env.DEBUG === '1') {
    console.error(...args)
  }
}

function readStdin() {
  if (!hasStdin) {
    debug('\nNothing to read from stdin')
    return
  }

  return new Promise((resolve, reject) => {
    debug('\nReading stdin...')

    let body = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => {
      if (process.env.DEBUG === '1') {
        process.stderr.write(chunk)
      }
      body += chunk
    })
    process.stdin.on('end', () => {
      debug('\n...Finished reading stdin')
      resolve(body)
    })
    process.stdin.on('error', reject)
    process.on('SIGINT', function onSigint() {
      debug('\nReceived SIGINT, ending input')
      process.stdin.emit('end')
      process.off('SIGINT', onSigint)
    })
  })
}

async function fileExists(path) {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

function parse(text, { fallbackRaw = false } = {}) {
  if (text == null || typeof text !== 'string' || text.trim() === '') {
    return text
  }

  try {
    return JSON.parse(text)
  } catch (err) {
    if (!(err instanceof SyntaxError)) {
      throw err
    }

    try {
      // Support NDJSON
      return text
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
    } catch (err) {
      if (!(err instanceof SyntaxError)) {
        throw err
      }

      if (fallbackRaw) {
        return text
      }

      // Could not parse JSON
      console.error(text)
      console.error('Input above is not valid JSON:', err.message)
      console.error('If you meant to pass a string, make sure it is wrapped with double quotes')
      console.error('If you piped jsq into itself, use --json on the first command')

      process.exit(1)
    }
  }
}

async function readCache() {
  if (!(await fileExists(cacheFile))) {
    return {}
  }

  try {
    return JSON.parse((await fs.readFile(cacheFile, 'utf8')) || '{}')
  } catch (err) {
    console.error('Cannot get cache, see error below:')
    console.error(err)
    return {}
  }
}

async function writeCache(cache) {
  const json = JSON.stringify(cache, null, 2)

  const dir = path.dirname(cacheFile)
  await fs.mkdir(dir, { recursive: true })

  await fs.writeFile(cacheFile, json)
}

async function delCache() {
  try {
    await fs.unlink(cacheFile)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err
    }
  }
}
