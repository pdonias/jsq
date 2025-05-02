#!/usr/bin/env node

const util = require('util')
const vm = require('vm')

// Make console.log print full objects and arrays
util.inspect.defaultOptions.depth = null
util.inspect.defaultOptions.maxArrayLength = null

let code = process.argv[2]
if (process.stdin.isTTY || code === undefined || ['-h', '--help'].includes(code) || process.argv[3] !== undefined) {
  console.log('Usage: cat data.json | jk this.length')
  process.exit(0)
}

if (code.startsWith('.')) {
  code = 'this' + code
}

const script = new vm.Script(code)

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => (input += chunk))
process.stdin.on('end', () => console.log(script.runInNewContext(JSON.parse(input))))
