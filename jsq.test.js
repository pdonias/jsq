const assert = require('node:assert/strict')
const path = require('node:path')
const { describe, test, beforeEach } = require('node:test')
const { spawnSync } = require('node:child_process')
const { expandShorthands } = require('./utils')

const BIN = path.resolve('./index.js')
const FOOBAR = '{"foo":1,"bar":2}'
const FOOBAR5 = '{ foo: 1, bar: 2 }'

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

  test('shorthand dot notation works everywhere in expression', () => {
    const { result } = runJSQ(FOOBAR, ['.foo + .bar'])
    assert.equal(result, '3')
  })
})

describe('JS expressions', () => {
  test('full JS expressions', () => {
    const { result } = runJSQ(FOOBAR, ['Object.keys(.).map(k => k + "=" + .[k]).join("; ")'])
    assert.equal(result, 'foo=1; bar=2')
  })
})

describe('multi-statement', () => {
  test('outputs the final statement', () => {
    const { result } = runJSQ(FOOBAR, ['let z = .foo + 2; z * .bar'])
    assert.equal(result, '6')
  })
})

describe('utils', () => {
  describe('echo()', () => {
    test('outputs the argument', () => {
      const { result } = runJSQ(FOOBAR, ['Object.keys(.).forEach(k => echo(k))'])
      assert.equal(result, 'foo\nbar')
    })

    test('ignores the final statement', () => {
      const { result } = runJSQ('', ['echo("intermediate"); "final result"'])
      assert.equal(result, 'intermediate')
    })
  })

  describe('console.*', () => {
    test('prints to stderr', () => {
      const { result, stdout, stderr } = runJSQ('', ['console.log("foo"); console.error("bar"); 42'])
      assert.equal(result, '42')
      assert.equal(stripAnsi(stderr), 'foo\nbar\n')
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
      const { result } = runJSQ(FOOBAR, ['invert(.)'])
      assert.equal(result, "{ '1': 'foo', '2': 'bar' }")
    })

    test('user object takes precedence', () => {
      const { result } = runJSQ(FOOBAR, ['--as', 'invert', 'invert'])
      assert.equal(result, FOOBAR5)
    })

    test('user function takes precedence', () => {
      const { result } = runJSQ('', ['--fn.invert', 'cmd', 'invert'])
      assert.equal(result, 'cmd')
    })
  })
})

describe('--as', () => {
  test('exposes named variable', () => {
    const { result } = runJSQ(FOOBAR, ['--as', 'foobar', 'foobar'])
    assert.equal(result, FOOBAR5)
  })
})

describe('--input', () => {
  test('exposes named variable', () => {
    const { result } = runJSQ('', ['--input.foobar', FOOBAR, 'foobar'])
    assert.equal(result, FOOBAR5)
  })
})

describe('--function', () => {
  test('exposes named function', () => {
    const { result } = runJSQ('', ['--function.myFn', 'cmd', 'myFn'])
    assert.equal(result, 'cmd')
  })

  test('calls function with args', () => {
    const { result } = runJSQ('', [
      '--function.printFoobar',
      `echo '{0}_${FOOBAR}_{1}'`,
      'printFoobar("prefix", "suffix")',
    ])
    assert.equal(result, `prefix_${FOOBAR}_suffix`)
  })
})

describe('--json', () => {
  test('outputs raw JSON', () => {
    const { result } = runJSQ(FOOBAR, ['.', '--json'])
    assert.equal(result, FOOBAR)
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
    runJSQ('', ['--fn.myFn', 'cmd'])
    const { result } = runJSQ('', ['myFn'])
    assert.equal(result, 'cmd')
  })

  test('--ls-cache prints out content of cache', () => {
    runJSQ('', ['--fn.myFn', 'cmd', '--in.foo', '1', '--in.bar', '2'])
    const { stderr } = runJSQ('', ['--ls-cache'])
    assert.match(stderr, /^Cache \(.*\):\n- Values: foo, bar\n- Functions: myFn/)
  })

  test('--no-cache ignores cache', () => {
    runJSQ('"foo"')
    const { result } = runJSQ('', ['--no-cache'])
    assert.equal(result, 'undefined')
  })
})

describe('expandShorthands', () => {
  describe('property access', () => {
    test('expands .foo', () => {
      const expanded = expandShorthands('.foo', 'input')
      assert.equal(expanded, 'input.foo')
    })

    test('expands .foo + .bar', () => {
      const expanded = expandShorthands('.foo + .bar', 'input')
      assert.equal(expanded, 'input.foo + input.bar')
    })

    test('expands {foo:.bar}', () => {
      const expanded = expandShorthands('{foo:.bar}', 'input')
      assert.equal(expanded, '{foo:input.bar}')
    })

    test('expands {..foo}', () => {
      const expanded = expandShorthands('{..foo}', 'input')
      assert.equal(expanded, '{input.foo}')
    })

    test('expands {....foo}', () => {
      const expanded = expandShorthands('{....foo}', 'input')
      assert.equal(expanded, '{...input.foo}')
    })

    test('does not expand foo.bar', () => {
      const expanded = expandShorthands('foo.bar', 'input')
      assert.equal(expanded, 'foo.bar')
    })

    test('does not expand .5', () => {
      const expanded = expandShorthands('.5', 'input')
      assert.equal(expanded, '.5')
    })

    test('does not expand foo?.()', () => {
      const expanded = expandShorthands('foo?.()', 'input')
      assert.equal(expanded, 'foo?.()')
    })

    test('does not expand // .foo', () => {
      const expanded = expandShorthands('// .foo', 'input')
      assert.equal(expanded, '// .foo')
    })

    test('does not expand /.foo/', () => {
      const expanded = expandShorthands('/.foo/', 'input')
      assert.equal(expanded, '/.foo/')
    })

    test('does not expand ".foo"; \'.bar\'; `.baz`', () => {
      const expanded = expandShorthands('".foo"; \'.bar\'; `.baz`', 'input')
      assert.equal(expanded, '".foo"; \'.bar\'; `.baz`')
    })

    test('properly expands .foo.bar', () => {
      const expanded = expandShorthands('.foo.bar', 'input')
      assert.equal(expanded, 'input.foo.bar')
    })

    test('properly expands .foo?.bar', () => {
      const expanded = expandShorthands('.foo?.bar', 'input')
      assert.equal(expanded, 'input.foo?.bar')
    })
  })

  describe('lone dot', () => {
    test('expands .', () => {
      const expanded = expandShorthands('.', 'input')
      assert.equal(expanded, 'input')
    })

    test('expands . + .foo', () => {
      const expanded = expandShorthands('. + .foo', 'input')
      assert.equal(expanded, 'input + input.foo')
    })

    test('expands {....}', () => {
      const expanded = expandShorthands('{....}', 'input')
      assert.equal(expanded, '{...input}')
    })
  })
})
