#!/usr/bin/env node

const childProcess = require('child_process')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const util = require('util')
const vm = require('vm')
const yargs = require('yargs/yargs')(process.argv.slice(2))

const CACHE = path.join(os.tmpdir(), 'jsq')
const INPUT_SYMBOL = process.env.SYMBOL || '_'

const PRINT_OPTIONS = {
  depth: Infinity,
  colors: true,
  maxArrayLength: Infinity,
  maxStringLength: Infinity,
  breakLength: process.stdout.columns,
  compact: 3,
}

// =============================================================================

yargs
  .locale('en')
  .strict()
  .usage('[command] | jsq [expression]')
  .example('curl -s https://api.github.com/users/octocat | jsq .followers')
  .epilog('Full documentation: https://github.com/pdonias/jsq/blob/master/README.md')
  .command('$0 [expression]', false, yargs =>
    yargs
      .positional('command', {
        description: 'Any command that outputs JSON can be piped into jsq',
        type: 'string',
      })
      .positional('expression', {
        description: 'Process the output of command with a JavaScript expression',
        default: '',
        type: 'string',
      })
  )
  .option('json', {
    type: 'boolean',
    description: 'JSON output instead of pretty print',
    default: false,
  })
  .option('depth', {
    type: 'number',
    alias: 'd',
    description: 'How deep the result object will be rendered',
  })
  .option('resolve', {
    type: 'string',
    description:
      'Configure a resolve command command to be used as resolve() in the expression. e.g.: curl https://api.com/users/{}',
  })
  .conflicts('json', 'depth')

function readStdin() {
  return new Promise((resolve, reject) => {
    let body = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => {
      if (process.env.DEBUG === '1') {
        process.stderr.write(chunk)
      }
      body += chunk
    })
    process.stdin.on('end', () => resolve(body))
    process.stdin.on('error', reject)
    process.on('SIGINT', function onSigint() {
      if (process.env.DEBUG === '1') {
        console.error('\nReceived SIGINT, ending input')
      }
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

// =============================================================================

async function main({ expression, json: jsonOutput, depth, resolve }) {
  if (depth !== undefined) {
    PRINT_OPTIONS.depth = depth
  }

  // Support expression "."
  if (expression === '.') {
    expression = INPUT_SYMBOL
  }

  // Support expressions "" and ".prop"
  if (expression === '' || expression.startsWith('.')) {
    expression = INPUT_SYMBOL + expression
  }

  await fs.mkdir(CACHE, { recursive: true })

  // Input ---------------------------------------------------------------------

  let input
  const inputCacheFile = path.join(CACHE, 'last.json')

  // Read input JSON from stdin or fallback to cache
  if (!process.stdin.isTTY) {
    input = await readStdin()
  } else if (await fileExists(inputCacheFile)) {
    input = await fs.readFile(inputCacheFile, 'utf8')
  }

  let inputObject
  try {
    inputObject = input === undefined || input.trim() === '' ? undefined : JSON.parse(input)
  } catch {
    // Support NDJSON
    inputObject = input
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
  }

  // Cache JSON for later runs, only if it was piped and if JSON is valid
  if (!process.stdin.isTTY) {
    await fs.writeFile(inputCacheFile, input)
  }

  // Evaluate ------------------------------------------------------------------

  if (process.env.DEBUG === '1') {
    console.error('\nExpression: ' + expression)
  }

  const context = vm.createContext()

  if (inputObject !== undefined) {
    Object.defineProperties(context, Object.getOwnPropertyDescriptors(inputObject))
  }

  context[INPUT_SYMBOL] = inputObject
  context.console = {
    log: (...args) => console.error('\x1b[34m' + util.format(...args) + '\x1b[0m'),
    error: (...args) => console.error('\x1b[31m' + util.format(...args) + '\x1b[0m'),
  }

  const resolveCacheFile = path.join(CACHE, 'resolve.txt')
  if (resolve !== undefined) {
    await fs.writeFile(resolveCacheFile, resolve)
  } else if (await fileExists(resolveCacheFile)) {
    resolve = await fs.readFile(resolveCacheFile, 'utf8')
  }

  if (resolve !== undefined) {
    const resolveFn = value => JSON.parse(childProcess.execSync(resolve.replaceAll('{}', value), { encoding: 'utf8' }))
    Object.defineProperty(resolveFn, 'cmd', {
      value: resolve,
      writable: false,
      enumerable: false,
    })
    context.resolve = resolveFn
  }

  const script = new vm.Script(expression)
  const result = script.runInContext(context)

  // Output --------------------------------------------------------------------

  if (jsonOutput) {
    if (result !== undefined) {
      console.log(JSON.stringify(result))
    }
    // If the result is undefined, make the JSON output empty
    return
  }

  // Inspect resolver
  if (typeof result === 'function' && result.cmd !== undefined) {
    console.log(result.cmd)
    return
  }

  // Don't show quotes if result is a string
  if (typeof result === 'string') {
    console.log(result)
    return
  }

  console.log(util.inspect(result, PRINT_OPTIONS))
}

main(yargs.argv)
