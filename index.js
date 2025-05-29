#!/usr/bin/env node

const childProcess = require('child_process')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const util = require('util')
const vm = require('vm')
const yargs = require('yargs/yargs')(process.argv.slice(2))

const { fileExists, readStdin, parse, readCache, writeCache, delCache } = require('./utils')

const DEFAULT_NAME = '_'

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
  .wrap(Math.min(process.stdout.columns || 80, 120))
  .strict()
  .parserConfiguration({
    'duplicate-arguments-array': false,
    'boolean-negation': false,
  })
  .usage('[command] | jsq [expression]')
  .alias('help', 'h')
  .alias('version', 'v')
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
    alias: 'j',
    description: 'Output JSON instead of pretty print',
    default: false,
  })
  .option('depth', {
    type: 'number',
    alias: 'd',
    description: 'How deep the result object will be rendered',
  })
  .option('as', {
    type: 'string',
    alias: 'a',
    description:
      'Name the global variable that will hold the piped data\n`<cmd> | jsq --as foo` is equivalent to `jsq --input.foo "$(<cmd>)"`',
    default: DEFAULT_NAME,
  })
  .option('input', {
    alias: 'i',
    description: 'Declare extra inputs as --input.users "$(cat users.json)" then use it in the expression as users',
    coerce: val => {
      if (typeof val === 'string' || Array.isArray(val)) {
        throw new Error('Use --input.<name> <json> instead of --input <json>')
      }
      return val
    },
  })
  .option('fn', {
    alias: 'f',
    description: 'Declare functions as --fn.<name> <cmd> then use it in the expression as <name>()',
    coerce: val => {
      if (typeof val === 'string' || Array.isArray(val)) {
        throw new Error('Use --fn.<name> <cmd> instead of --fn')
      }
      return val
    },
  })
  .option('resolve', {
    type: 'string',
    alias: 'r',
    description: 'Shorthand for --fn.resolve',
  })
  .option('ls-cache', {
    type: 'boolean',
    alias: 'l',
    default: false,
    description: 'Show content of cache, then stop',
  })
  .option('clear-cache', {
    type: 'boolean',
    alias: 'c',
    default: false,
    description: 'Delete cached objects and functions, then stop',
  })
  .option('no-cache', {
    type: 'boolean',
    alias: 'n',
    default: false,
    description: "Keep cached objects and functions but ignore them and don't cache new ones either",
  })

// =============================================================================

async function main(opts) {
  if (process.env.DEBUG === '1') {
    console.error('Options:')
    console.error(opts)
  }

  if (opts.lsCache) {
    const { inputs = {}, fns = {} } = await readCache()
    console.error('Cache:')
    console.error(`- Inputs: ${Object.keys(inputs).join(', ')}`)
    console.error(`- Functions: ${Object.keys(fns).join(', ')}`)
    console.error('\nRun `jsq <name>` to see the value of a cached input or function')
    console.error('Run `jsq --clear-cache` to forget everything')
    return
  }

  if (opts.clearCache) {
    await delCache()
    console.error('Cache cleared')
    return
  }

  // Inputs and options --------------------------------------------------------
  const hasStdin = !process.stdin.isTTY

  if (hasStdin && typeof opts.input === 'string') {
    console.error(
      'You cannot pipe data and use --input at the same time. They are equivalent, choose one.\nIf you meant to pass extra inputs, use the named input syntax --input.<name> <json>.'
    )
    process.exit(1)
  }

  if (opts.fn?.resolve !== undefined && opts.resolve !== undefined) {
    console.error('You cannot use --resolve and --fn.resolve at the same time. They are equivalent, choose one.')
    process.exit(1)
  }

  let expression = opts.expression

  if (opts.depth !== undefined) {
    PRINT_OPTIONS.depth = opts.depth
  }

  // Support expression "."
  if (expression === '.') {
    expression = opts.as
  }

  // Support expressions "" and ".prop"
  if (expression === '' || expression.startsWith('.')) {
    expression = opts.as + expression
  }

  // Get previous inputs and functions
  const userContext = opts.noCache ? {} : await readCache()
  if (userContext.inputs === undefined) {
    userContext.inputs = {}
  }
  if (userContext.fns === undefined) {
    userContext.fns = {}
  }

  // Read input from stdin by default
  if (hasStdin) {
    userContext.inputs[opts.as] = parse(await readStdin())
  }

  // Support --input.<name> options
  if (typeof opts.input === 'object') {
    Object.entries(opts.input).forEach(([name, input]) => {
      userContext.inputs[name] = parse(input)
    })
  }

  // Support --fn.<name> options
  if (typeof opts.fn === 'object') {
    Object.assign(userContext.fns, opts.fn)
  }

  // Support --resolve shorthand option
  if (typeof opts.resolve === 'string') {
    userContext.fns.resolve = opts.resolve
  }

  // Build script context ------------------------------------------------------

  const context = vm.createContext()

  const addToContext = (key, value) => {
    if (key in context) {
      throw new Error(`${key} cannot be added to the context because it already exists`)
    }
    context[key] = value
  }

  // Default utils
  addToContext('console', {
    log: (...args) => console.error('\x1b[34m' + util.format(...args) + '\x1b[0m'),
    error: (...args) => console.error('\x1b[31m' + util.format(...args) + '\x1b[0m'),
  })

  let explicitOutput = false
  addToContext('echo', arg => {
    explicitOutput = true
    output(arg)
  })

  // Declare all inputs
  Object.entries(userContext.inputs).forEach(([name, obj]) => {
    addToContext(name, obj)
  })

  // Declare all functions
  Object.entries(userContext.fns).forEach(([name, pattern]) => {
    const fn = function () {
      // Replace:
      // - {} with first arg
      // - {i} with i-th arg
      // Escape with \{i}
      const cmd = pattern.replace(/(?<!\\){(\d+)?}/g, (_, i) => arguments[i ?? 0] ?? '').replace(/\\({\d*})/g, '$1')

      return parse(childProcess.execSync(cmd, { encoding: 'utf8' }), { fallbackRaw: true })
    }

    Object.defineProperty(fn, 'cmd', {
      value: pattern,
      writable: false,
      enumerable: false,
    })

    addToContext(name, fn)
  })

  if (context[opts.as] === undefined) {
    addToContext(opts.as, undefined)
  }

  // If we managed to assign all the inputs and functions, then save everything to cache
  if (!opts.noCache) {
    await writeCache(userContext)
  }

  // Evaluate ------------------------------------------------------------------

  if (process.env.DEBUG === '1') {
    console.error('\nExpression: ')
    console.error(expression)
    console.error('\nUser context:')
    console.error(userContext)
    console.error('\nContext:')
    console.error(context)
    console.error('\nResult:')
  }

  const script = new vm.Script(expression)
  const result = script.runInContext(context)

  // Output --------------------------------------------------------------------

  if (!explicitOutput) {
    // Expression uses the explicit echo() function: don't use the last statement as output
    output(result)
  }

  function output(result) {
    if (opts.json) {
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
}

main(yargs.argv)
