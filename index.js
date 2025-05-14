#!/usr/bin/env node

const util = require('util')
const vm = require('vm')
const os = require('os')
const path = require('path')
const fs = require('fs').promises

const CACHE = path.join(os.tmpdir(), 'jsq', 'last.json')
const INPUT_SYMBOL = process.env.SYMBOL || '_'

const PRINT_OPTIONS = {
  depth: Infinity,
  colors: true,
  maxArrayLength: Infinity,
  maxStringLength: Infinity,
  breakLength: process.stdout.columns,
  compact: 3,
}

const ARGS_SCHEMA = {
  json: 'boolean',
  depth: 'number',
  help: 'boolean',
  version: 'boolean',
}

function parseArgs(argv) {
  const args = {
    _: [],
  }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      args._.push(arg)
      continue
    }

    const name = arg.slice(2)
    const type = ARGS_SCHEMA[name]
    switch (type) {
      case 'boolean':
        args[name] = true
        break
      case 'string':
        args[name] = argv[++i]
        break
      case 'number':
        args[name] = +argv[++i]
        break
      default:
        usage()
        throw new Error(`Unexpected arg ${arg}`)
    }
  }

  return args
}

function usage() {
  console.error(`v${require('./package.json').version}`)
  console.error('Usage: <command> | jsq <expression> [--json] [--depth <depth>]')
  console.error('Example: curl -s https://api.github.com/users/octocat | jsq .followers')
  console.error('Full documentation: https://github.com/pdonias/jsq/blob/master/README.md')
}

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

async function main() {
  let {
    _: [expression = ''],
    json: jsonOutput = false,
    depth,
    help,
    version,
  } = parseArgs(process.argv)

  if (help || version) {
    usage()
    return
  }

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

  // Input ---------------------------------------------------------------------

  // Fallback to cached JSON file if nothing was piped. Error if cache is also empty.
  if (process.stdin.isTTY && !(await fileExists(CACHE))) {
    console.error('Nothing to read from stdin.\n')
    usage()
    process.exit(1)
  }

  const input = process.stdin.isTTY ? await fs.readFile(CACHE, 'utf8') : await readStdin()
  if (input.trim() === '') {
    console.error('Input is empty.')
    return
  }

  let inputObject
  try {
    inputObject = JSON.parse(input)
  } catch {
    // Support NDJSON
    inputObject = input
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
  }

  // Cache JSON for later runs, only if it was piped and if JSON is valid
  if (!process.stdin.isTTY) {
    await fs.mkdir(path.dirname(CACHE), { recursive: true })
    await fs.writeFile(CACHE, input)
  }

  // Evaluate ------------------------------------------------------------------

  if (process.env.DEBUG === '1') {
    console.error('\nExpression: ' + expression)
  }

  const context = vm.createContext()

  Object.defineProperties(context, Object.getOwnPropertyDescriptors(inputObject))
  context[INPUT_SYMBOL] = inputObject

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

  // Don't show quotes if result is a string
  if (typeof result === 'string') {
    console.log(result)
    return
  }

  console.log(util.inspect(result, PRINT_OPTIONS))
}

main()
