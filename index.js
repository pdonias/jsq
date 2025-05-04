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

let code = process.argv[2] || ''
if (process.stdin.isTTY || ['-h', '--help'].includes(code) || process.argv[3] !== undefined) {
  console.log('Usage: <command> | jsq <expression>')
  console.log("Example: curl -s https://api.github.com/users/octocat | jsq .followers")
  console.log('Full documentation: https://github.com/pdonias/jsq/blob/master/README.md')

  process.exit(0)
}

if (code === '' || code.startsWith('.')) {
  code = '$' + code
}

const script = new vm.Script(code)

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => (input += chunk))
process.stdin.on('end', () => {
  const $ = JSON.parse(input)
  const context = vm.createContext()
  Object.defineProperties(context, Object.getOwnPropertyDescriptors($))
  context.$ = $

  const json = JSON.stringify(script.runInContext(context))
  if (json !== undefined) {
    console.log(util.inspect(JSON.parse(json), PRINT_OPTIONS))
  } else {
    console.log('undefined')
  }
})
