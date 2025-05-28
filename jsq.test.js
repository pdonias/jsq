const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')
const { spawnSync } = require('node:child_process')

const BIN = path.resolve('./index.js')

function stripAnsi(str) {
  // Regex to match ANSI escape codes
  return str.replace(/[\u001b\u009b][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

function runJSQ(input, args, options = {}) {
  const res = spawnSync('node', [BIN, '--no-cache', ...args], {
    input,
    encoding: 'utf-8',
    ...options,
  })

  if (res.error) {
    throw res.error
  }

  return stripAnsi(res.stdout.trim())
}

test('access properties with dot notation', () => {
  const result = runJSQ('{ "foo": 123, "bar": 456 }', ['.foo'])
  assert.equal(result, '123')
})

test('full JS expressions', () => {
  const result = runJSQ('{ "a": 1, "b": 2 }', ['Object.keys(_).map(k => k + "=" + _[k]).join("; ")'])
  assert.equal(result, 'a=1; b=2')
})

test('multi-statement + final result', () => {
  const result = runJSQ('{ "y": 100 }', ['let z = _.y + 2; z * 2'])
  assert.equal(result, '204')
})

test('echo() output', () => {
  const result = runJSQ('{ "a": 1, "b": 2 }', ['Object.keys(_).forEach(k => echo(k))'])
  assert.equal(result, 'a\nb')
})

test('echo() with final return (should ignore return)', () => {
  const result = runJSQ('{ "a": 1 }', ['echo("intermediate"); "final result"'])
  assert.equal(result, 'intermediate')
})

test('--json flag outputs raw JSON', () => {
  const result = runJSQ('{ "arr": [1, 2] }', ['.arr', '--json'])
  assert.equal(result, '[1,2]')
})

test('--depth option renders deeply nested object', () => {
  const input = JSON.stringify({ a: { b: { c: { d: { e: 5 } } } } })
  const result = runJSQ(input, ['.', '--depth', '3'])
  assert.match(result, /\[Object\]/)
})
