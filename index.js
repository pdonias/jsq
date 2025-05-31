#!/usr/bin/env node

const childProcess = require('child_process')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const util = require('util')
const vm = require('vm')
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

const { debug, fileExists, readStdin, parse, readCache, writeCache, delCache } = require('./utils')

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

const argv = yargs(hideBin(process.argv))
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
      'Name the global variable that will hold the piped data\n`<cmd> | jsq --as <name>` is equivalent to `jsq --input.<name> "$(<cmd>)"`',
  })
  .option('save-as', {
    type: 'string',
    alias: 'S',
    description: 'Name the global variable that will hold the result of this run in the next runs',
  })
  .option('input', {
    alias: 'in',
    description: 'Declare extra inputs as --input.<name> <json> then use them in the expression as <name>',
    default: {},
    coerce: input => {
      if (
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.values(input).some(value => !['string', 'number'].includes(typeof value))
      ) {
        throw new Error('Use --input.<name> <json>')
      }
      return Object.fromEntries(Object.entries(input).map(entry => [entry[0], String(entry[1])]))
    },
  })
  .option('function', {
    alias: 'fn',
    description: "Declare functions as --fn.<name> '<cmd>' then use them in the expression as <name>()",
    default: {},
    coerce: fn => {
      if (typeof fn !== 'object' || Array.isArray(fn) || Object.values(fn).some(value => typeof value !== 'string')) {
        throw new Error("Use --fn.<name> '<cmd>'")
      }
      return fn
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
  }).argv

// =============================================================================

async function main(opts) {
  debug('Options:')
  debug(opts)

  if (opts.lsCache) {
    const { values = {}, fns = {} } = await readCache()
    console.error('Cache:')
    console.error(`- Values: ${Object.keys(values).join(', ')}`)
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
    console.error('You cannot pipe data and use --input at the same time. They are equivalent, choose one.')
    console.error('If you meant to pass extra inputs, use the named input syntax --input.<name> <json>.')
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
    expression = opts.as ?? '_'
  }

  // Support expressions "" and ".prop"
  if (expression === '' || expression.startsWith('.')) {
    expression = (opts.as ?? '_') + expression
  }

  // Get previously saved values and functions
  const userContext = opts.noCache ? {} : await readCache()
  if (!('values' in userContext)) {
    userContext.values = {}
  }
  if (!('fns' in userContext)) {
    userContext.fns = {}
  }
  if (!('in' in userContext)) {
    userContext.in = undefined
  }
  if (!('out' in userContext)) {
    userContext.out = undefined
  }

  // Main user input
  if (hasStdin) {
    userContext.in = parse(await readStdin())
    if (opts.as !== undefined) {
      userContext.values[opts.as] = userContext.in
    }
  }

  // Support --input.<name> options
  Object.entries(opts.input).forEach(([name, input]) => {
    userContext.values[name] = parse(input)
  })

  // Support --fn.<name> options
  Object.assign(userContext.fns, opts.fn)

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

  // Declare main input and last run's output
  addToContext('_', userContext.in)
  addToContext('_in', userContext.in)
  addToContext('_out', userContext.out)

  // Declare all saved values
  Object.entries(userContext.values).forEach(([name, obj]) => {
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

  // Evaluate ------------------------------------------------------------------

  debug('\nExpression: ')
  debug(expression)
  debug('\nUser context:')
  debug(userContext)
  debug('\nContext:')
  debug(context)
  debug('\n')

  const script = new vm.Script(expression)
  const result = script.runInContext(context)

  // Output --------------------------------------------------------------------

  if (!explicitOutput) {
    // Expression uses the explicit echo() function: don't use the last statement as output
    output(result)
  }

  // If the whole run was successful, then save user context to cache
  if (!opts.noCache) {
    await writeCache(userContext)
  }

  function output(result) {
    let json, jsonErr
    try {
      json = result && JSON.stringify(result, null, 2)
      // If the result is stringifiable, add it to the context so that it can be cached
      userContext.out = result
      if (opts.saveAs !== undefined) {
        userContext.values[opts.saveAs] = result
      }
    } catch (err) {
      debug('result will not be cached because it is not stringifiable:', err.message)
      jsonErr = err
    }

    if (opts.json) {
      if (jsonErr !== undefined) {
        throw jsonErr
      }

      // If the result is undefined, make the JSON output empty
      if (json !== undefined) {
        debug('JSON result:')
        console.log(json)
      }

      return
    }

    // Inspect resolver: show the shell command
    if (typeof result === 'function' && result.cmd !== undefined) {
      debug('Function result:')
      console.log(result.cmd)
      return
    }

    // Don't show quotes if result is a string
    if (typeof result === 'string') {
      debug('String result:')
      console.log(result)
      return
    }

    debug('Result:')
    console.log(util.inspect(result, PRINT_OPTIONS))
  }
}

main(argv)
