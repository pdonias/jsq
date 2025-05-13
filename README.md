# jsq

A command-line JSON processor like [`jq`](https://stedolan.github.io/jq/), but using familiar **JavaScript syntax** instead of a custom DSL.

## Install

```bash
npm install --global jsq-cli
```

## Usage

```bash
$ <command> | jsq <expression> [--json] [--depth <depth>]
```

Access properties like `jq`:
```bash
$ echo '{ "foo": 1, "bar": 2 }' | jsq .foo
1
```

Or use full JavaScript expressions:
```bash
$ echo '{ "foo": 1, "bar": 2 }' | jsq 'Object.keys(_).map(key => `${key}=${_[key]}`).join("; ")'
foo=1; bar=2
```

- The parsed JSON input is available as `_`
- Your expression is plain JavaScript: it supports multiple statements, variable declaration, if statements, etc.
- The result is the value of the last evaluated statement
- Each top-level property of the input object is also available globally (`foo` instead of `_.foo`)
- You can omit `_` as the first character of the expression (`.foo` is treated as `_.foo`)
- Use `--json` to get a raw JSON output
- Use `--depth` to configure how deep the result object will be rendered (ignored if `--json` is passed)
- Remembers the last JSON input: if you're working on the same JSON input multiple times, you only need to pipe it the first time
