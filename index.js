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

let expression = process.argv[2] || ''
const jsonOutput = expression === '--json'
if (jsonOutput) {
  expression = process.argv[3] || ''
}

if (process.stdin.isTTY || ['-h', '--help'].includes(expression) || process.argv.length > 4) {
  console.log('Usage: <command> | jsq [--json] <expression>')
  console.log('Example: curl -s https://api.github.com/users/octocat | jsq .followers')
  console.log('Full documentation: https://github.com/pdonias/jsq/blob/master/README.md')

  process.exit(0)
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

  if (result === undefined) {
    if (!jsonOutput) {
      console.log('undefined') // Show explicit undefined to humans
    }
  } else {
    if (jsonOutput) {
      console.log(JSON.stringify(result))
    } else {
      console.log(util.inspect(result, PRINT_OPTIONS))
    }
  }
})
