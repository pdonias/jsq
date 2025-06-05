const assert = require('node:assert/strict')
const path = require('node:path')
const { describe, test, beforeEach } = require('node:test')
const { spawnSync } = require('node:child_process')

const BIN = path.resolve('./index.js')
const FOOBAR = '{ "foo": 1, "bar": 2 }'

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
    const { result } = runJSQ(FOOBAR, ['.foo'])
    assert.equal(result, '1')
  })
})

describe('JS expressions', () => {
  test('full JS expressions', () => {
    const { result } = runJSQ(FOOBAR, ['Object.keys(_).map(k => k + "=" + _[k]).join("; ")'])
    assert.equal(result, 'foo=1; bar=2')
  })
})

describe('multi-statement', () => {
  test('outputs the final statement', () => {
    const { result } = runJSQ(FOOBAR, ['let z = _.foo + 2; z * _.bar'])
    assert.equal(result, '6')
  })
})

describe('echo()', () => {
  test('outputs the argument', () => {
    const { result } = runJSQ(FOOBAR, ['Object.keys(_).forEach(k => echo(k))'])
    assert.equal(result, 'foo\nbar')
  })

  test('ignores the final statement', () => {
    const { result } = runJSQ('', ['echo("intermediate"); "final result"'])
    assert.equal(result, 'intermediate')
  })
})

describe('exit()', () => {
  test('ends the process with the exit code', () => {
    const { status } = runJSQ('', ['exit(42)'])
    assert.equal(status, 42)
  })
})

describe('lodash', () => {
  test('functions are declared in global scope', () => {
    const { result } = runJSQ(FOOBAR, ['invert(_)'])
    assert.equal(result, "{ '1': 'foo', '2': 'bar' }")
  })

  test('user object takes precedence', () => {
    const { result } = runJSQ(FOOBAR, ['--as', 'invert', 'invert'])
    assert.equal(result, '{ foo: 1, bar: 2 }')
  })

  test('user function takes precedence', () => {
    const { result } = runJSQ('', ['--fn.invert', 'cmd', 'invert'])
    assert.equal(result, 'cmd')
  })
})

describe('--json', () => {
  test('outputs raw JSON', () => {
    const { result } = runJSQ(FOOBAR, ['.', '--json'])
    assert.equal(result, '{"foo":1,"bar":2}')
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
