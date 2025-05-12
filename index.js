#!/usr/bin/env node

const util = require('util')
const vm = require('vm')

const PRINT_OPTIONS = {
  depth: Infinity,
  colors: true,
  maxArrayLength: Infinity,
  maxStringLength: Infinity,
  breakLength: process.stdout.columns,
  compact: 3,
}

const INPUT_SYMBOL = process.env.SYMBOL || '_'

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
      case 'boolean': args[name] = true; break;
      case 'string': args[name] = argv[++i]; break;
      case 'number': args[name] = +argv[++i]; break;
      default: usage(); throw new Error(`Unexpected arg ${arg}`)
    }
  }

  return args
}

function usage() {
  console.log(`v${require('./package.json').version}`)
  console.log('Usage: <command> | jsq <expression> [--json] [--depth <depth>]')
  console.log('Example: curl -s https://api.github.com/users/octocat | jsq .followers')
  console.log('Full documentation: https://github.com/pdonias/jsq/blob/master/README.md')
}

// -----------------------------------------------------------------------------

function main() {
  let {
    _: [expression = ''],
    json: jsonOutput = false,
    depth,
    help,
    version,
  } = parseArgs(process.argv)

  if (help || version || process.stdin.isTTY) {
    usage()
    process.exit(help || version ? 0 : 1)
  }

  if (depth !== undefined) {
    PRINT_OPTIONS.depth = depth
  }

  if (expression === '' || expression.startsWith('.')) {
    expression = INPUT_SYMBOL + expression
  }

  if (expression === INPUT_SYMBOL + '.') {
    expression = INPUT_SYMBOL
  }

  if (process.env.DEBUG === '1') {
    console.log('Expression: ' + expression)
  }

  const script = new vm.Script(expression)

  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => (input += chunk))
  process.stdin.on('end', () => {
    const inputObject = JSON.parse(input)
    const context = vm.createContext()

    Object.defineProperties(context, Object.getOwnPropertyDescriptors(inputObject))
    context[INPUT_SYMBOL] = inputObject

    const result = script.runInContext(context)

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
  })
}

main()
