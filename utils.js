const acorn = require('acorn')
const envPaths = require('env-paths').default
const fs = require('fs').promises
const path = require('path')

const paths = envPaths('jsq', { suffix: '' })

const cacheDir = paths.cache
const cacheFile = path.join(cacheDir, process.env.CACHE || 'cache.json')

const hasStdin = process.env.STDIN === undefined ? !process.stdin.isTTY : process.env.STDIN === '1'

module.exports = {
  cacheFile,
  debug,
  delCache,
  expandShorthands,
  fileExists,
  hasStdin,
  parse,
  readCache,
  readStdin,
  writeCache,
}

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
const NON_SHORTHAND_LABELS = new Set(['name', 'num', ']', ')', '}', 'null', 'true', 'false'])
function expandShorthands(expression, replacement) {
  const tokens = [...acorn.tokenizer(expression, { ecmaVersion: 'latest' })]
  let result = ''
  let cursor = 0

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const next = tokens[i + 1]
    const prev = tokens[i - 1]

    if (token.type.label !== '.') {
      continue
    }

    // Ignore foo.bar
    const isPropertyAccess =
      next?.type.label === 'name' &&
      NON_SHORTHAND_LABELS.has(prev?.type.label)

    // Ignore 1.5
    const isDecimalNumber =
      next?.type.label === 'num' &&
      expression.slice(token.end, next.start).trim() === ''

    if (isPropertyAccess || isDecimalNumber) {
      continue
    }

    result += expression.slice(cursor, token.start) + replacement
    // `.prop` keep the dot, `.` don't keep the dot
    cursor = next?.type.label === 'name' ? token.start : token.end

    // Next token needs to see this one as a name
    token.type = { ...token.type, label: 'name' }
  }

  // copy-paste the end of the expression that doesn't contain a dot
  result += expression.slice(cursor)

  return result
}
