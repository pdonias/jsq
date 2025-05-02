#!/usr/bin/env node

let code = process.argv[2]
if (process.stdin.isTTY || code === undefined || ['-h', '--help'].includes(code) || process.argv[3] !== undefined) {
  console.log('Usage: cat data.json | jk this.length')
  process.exit(0)
}

if (code.startsWith('.')) {
  code = 'this' + code
}

if (!code.includes('return')) {
  code = 'return ' + code
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => (input += chunk))
process.stdin.on('end', () => {
  const result = eval(`(function(){${code}}).call(${input})`)
  console.log(JSON.stringify(result, null, 2))
})
