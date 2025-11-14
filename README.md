# jsq

[![License](https://img.shields.io/npm/l/jsq-cli?color=blue)](./LICENSE)
[![NPM Version](https://img.shields.io/npm/v/jsq-cli?logo=npm&logoColor=red)](https://www.npmjs.com/package/jsq-cli)
[![CI status](https://github.com/pdonias/jsq/actions/workflows/main.yml/badge.svg)](https://github.com/pdonias/jsq/actions/workflows/main.yml)
![Dependencies status](https://img.shields.io/librariesio/github/pdonias/jsq?label=deps)
[![NPM bundle size](https://img.shields.io/bundlephobia/min/jsq-cli?label=size)](https://bundlephobia.com/package/jsq-cli)
![NPM Downloads](https://img.shields.io/npm/d18m/jsq-cli)

A command-line JSON processor like [`jq`](https://stedolan.github.io/jq/), but using familiar **JavaScript syntax** instead of a custom DSL.

## Install

```bash
npm install --global jsq-cli
```

## Usage

```bash
$ <command> | jsq <expression>
```

Access properties like `jq`:
```bash
$ echo '{ "foo": 1, "bar": 2 }' | jsq .foo
1
```

Or use full JavaScript expressions:
```bash
$ echo '{ "foo": 1, "bar": 2 }' | jsq 'Object.entries(.).map(entry => entry.join("=")).join("; ")'
foo=1; bar=2
```

## Input

A JSON input can be piped into jsq and optionally named with `--as`:
```bash
$ echo '{ "foo": 1, "bar": 2 }' | jsq --as myInput 'myInput.foo'
1
```

Inputs can also be declared by passing `--input.<name>` options:
```bash
$ jsq --input.myInput '{ "foo": 1, "bar": 2 }' 'myInput.foo'
1
```

jsq also supports NDJSON from stdin. The NDJSON data is converted to an array and injected into the expression like a normal piped input.

> [!TIP]
> Early interrupt an NDJSON input with <kbd>Ctrl</kbd> + <kbd>C</kbd>.
> Use `--no-buffer` on `curl` to force it to write immediately to stdout.

## Expression

You can process the input(s) with a JavaScript expression. The expression may contain multiple statements, the value of the last statement is the output of jsq.

Whether or not you named the piped input with `--as`, it is also accessible in the expression as `.` (also aliased as `_` if you want to avoid invalid JavaScript syntax):

```bash
$ echo '{ "foo": 1, "bar": 2 }' | jsq 'Object.keys(.).join(", ")'
foo, bar

$ echo '{ "foo": 1, "bar": 2 }' | jsq 'a = .foo; b = _.bar; a + b'
3
```

> [!IMPORTANT]
> If the last statement is an inline object, wrap it with `({ ... })` so that NodeJS doesn't interpret it as a block.

## Output

If you don't call [echo](#echo) in the expression, jsq outputs the value of the last statement in the expression. If you don't pass an expression, it will simply format and pretty-print the piped input.

- Use `--depth <n>` if the output is an object to configure how deep the object will be rendered.
- Use `--json` to output raw JSON instead of pretty-print.

## Functions

Use `--fn.<name> <cmd>` to declare shell-based functions that will also be accessible from within the expression in the global scope. The command may contain `{0}`, `{1}`, `{2}`, ... that will be replaced by the function's arguments when you call it in the expression. `{}` is an alias for `{0}`.

```bash
$ echo '{ "foo": 1, "bar": 2 }' | jsq --fn.apiFetch 'curl https://api.com/{0}/{1}' 'apiFetch("user", .foo)'
{ userid: 1, firstname: 'John', lastname: 'Doe' }
```

- Use `--resolve <cmd>` or `-r <cmd>` as a shorthand for `--fn.resolve <cmd>`.
- The output of functions is automatically `JSON.parse`d if possible.
- Escape a `{i}` with `\{i}`.

## Utils

Some utility functions are also exposed in the global scope.

### `echo`

By default, the output of jsq is the value of the last JavaScript statement in the expression. However, if you want to declare the output explicitly, you can call the function `echo` in the expression. You may call it one or multiple times. If you call it at least once, jsq will ignore the value of the last statement and let you manage the output. If you call it multiple times, the values will be printed to stdout separated by newlines.

```bash
$ echo '{ "foo": 1, "bar": 2 }' | jsq 'Object.entries(.).forEach(([key, value]) => echo(`${key}: ${value}`))'
foo: 1
bar: 2
```

### `console.log`/`console.error`

You may call `console.log` and `console.error` to debug your expression. It won't pollute the stdout as both are redirected to stderr.

### `exit`

You may call `exit` explicitly to end the jsq process early. Pass the exit code (or a boolean) as an argument. This can be useful to conditionally return early.

### `lodash`

All [`lodash`](https://lodash.com/docs) functions are available in the global context, except if one or more of your named inputs or functions override them.

```js
$ echo '{ "foo": 1, "bar": 2 }' | jsq 'invert(.)'
{ '1': 'foo', '2': 'bar' }
```

## Cache

By default, jsq remembers:
- inputs: this is convenient if the command you pipe into jsq takes a while to return. If you need to run mutilple expressions on the same input, you only need to pipe it the first time.
- outputs: access the result of the previous run with `_ans` or save the result of a run as a named global variable with `--save-as <name>` to reuse the result of a run in the next ones.
- functions: similarly, if you configure some helper [functions](#functions), you can reuse them in later calls without redeclaring them.

```bash
# Pipe the input once
$ echo '{ "foo": 1, "bar": 2 }' | jsq
{ foo: 1, bar: 2 }

# and jsq remembers it on the following runs
$ jsq .foo
1

# Declare functions with --fn
$ jsq --fn.apiFetch 'curl https://api.com/{0}/{1}' 'apiFetch("user", _ans)'
{ userid: 1, firstname: 'John', lastname: 'Doe' }

# and jsq remembers them too
$ jsq 'apiFetch("user", .bar)'
{ userid: 2, firstname: 'Jane', lastname: 'Doe' }

# jsq also remembers the last result as _ans, give it a proper name with --save-as
$ jsq _ans --save-as jane
{ userid: 2, firstname: 'Jane', lastname: 'Doe' }
```

- Use `--ls-cache` to see the content of the cache.
- Use `--clear-cache` to delete everything from the cache.
- Use `--no-cache` to ignore cache completely for the current run (no read, no write)

## Examples

*Outputs are omitted for clarity*

1. Digging through a JSON

```bash
$ curl https://api.com/users | jsq # Pipe an input
$ jsq 'find(., { firstname: "John", lastname: "Doe" })' # Find an item with Lodash's find
$ jsq _ans | jsq # To work on that object, make it the new main input
$ jsq .friends --save-as friends # Save John's friends into a variable
$ jsq 'friends.forEach(f => { if (f.age > .age) { echo(f.firstname) } })' # Print friends that are older than John
```

2. Using functions and variables

```bash
$ curl https://api.com/ids | jsq --as userIds # Pipe an input and name it
$ jsq --resolve 'curl https://api.com/user/{}' # Tell jsq how to resolve a user ID
$ jsq --fn.read 'cat {}' # Tell jsq how to resolve a filename
$ jsq 'userIds.map(resolve).map(user => read(user.tokenFile)).join("\n")' # Use functions and variables
```
