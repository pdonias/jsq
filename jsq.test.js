const assert = require('node:assert/strict')
const path = require('node:path')
const { describe, test, beforeEach } = require('node:test')
const { spawnSync } = require('node:child_process')

const BIN = path.resolve('./index.js')

function stripAnsi(str) {
  // Regex to match ANSI escape codes
  return str.replace(/[\u001b\u009b][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

function runJSQ(input, args = [], options = {}) {
  const res = spawnSync(BIN, args, {
    input,
    encoding: 'utf-8',
    ...options,
    env: { ...process.env, CACHE: 'cache-test.json', STDIN: input ? '1' : '0', ...options.env },
  })

  return { ...res, result: stripAnsi(res.stdout.trim()) }
}

describe('access properties', () => {
  test('access properties with dot notation', () => {
    const { result } = runJSQ('{ "foo": 123, "bar": 456 }', ['.foo'])
    assert.equal(result, '123')
  })
})

describe('JS expressions', () => {
  test('full JS expressions', () => {
    const { result } = runJSQ('{ "a": 1, "b": 2 }', ['Object.keys(_).map(k => k + "=" + _[k]).join("; ")'])
    assert.equal(result, 'a=1; b=2')
  })
})

describe('multi-statement', () => {
  test('outputs the final statement', () => {
    const { result } = runJSQ('{ "y": 100 }', ['let z = _.y + 2; z * 2'])
    assert.equal(result, '204')
  })
})

describe('echo()', () => {
  test('outputs the argument', () => {
    const { result } = runJSQ('{ "a": 1, "b": 2 }', ['Object.keys(_).forEach(k => echo(k))'])
    assert.equal(result, 'a\nb')
  })

  test('ignores the final statement', () => {
    const { result } = runJSQ('{ "a": 1 }', ['echo("intermediate"); "final result"'])
    assert.equal(result, 'intermediate')
  })
})

describe('exit()', () => {
  test('ends the process with the exit code', () => {
    const { status } = runJSQ('', ['exit(42)'])
    assert.equal(status, 42)
  })
})

describe('--json', () => {
  test('outputs raw JSON', () => {
    const { result } = runJSQ('{ "arr": [1, 2] }', ['.arr', '--json'])
    assert.equal(result, '[1,2]')
  })
})

describe('--depth', () => {
  test('does not render deeper than depth', () => {
    const input = JSON.stringify({ a: { b: { c: { d: { e: 5 } } } } })
    const { result } = runJSQ(input, ['.', '--depth', '3'])
    assert.match(result, /\[Object\]/)
  })
})

describe('cache', () => {
  beforeEach(() => runJSQ('', ['--clear-cache']))

  test('remembers the last input', () => {
    runJSQ('"bar"')
    const { result } = runJSQ()
    assert.equal(result, 'bar')
  })

  test('remembers named input', () => {
    runJSQ('"bar"', ['--as', 'foo'])
    const { result } = runJSQ('', ['foo'])
    assert.equal(result, 'bar')
  })

  test('remembers extra inputs', () => {
    runJSQ('', ['--in.foo', '"bar"'])
    const { result } = runJSQ('', ['foo'])
    assert.equal(result, 'bar')
  })

  test('remembers functions', () => {
    runJSQ('', ['--fn.myFn', 'mycmd'])
    const { result } = runJSQ('', ['myFn'])
    assert.equal(result, 'mycmd')
  })

  test('prints out content of cache', () => {
    runJSQ('', ['--fn.myFn', 'mycmd', '--in.foo', '1', '--in.bar', '2'])
    const { stderr } = runJSQ('', ['--ls-cache'])
    assert.match(stderr, /^Cache:\n- Values: foo, bar\n- Functions: myFn/)
  })
})
