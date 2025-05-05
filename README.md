# jsq

A command-line JSON processor like [`jq`](https://stedolan.github.io/jq/), but using JavaScript syntax.

## Install

```bash
npm install --global jsq-cli
```

## Usage

```bash
$ <command> | jsq [--json] <expression>
```

Access properties like `jq`:
```bash
$ echo '{ "foo": 1, "bar": 2 }' | jsq .foo
1
```

Or use full JavaScript expressions:
```bash
$ echo '{ "foo": 1, "bar": 2 }' | jsq 'keys = Object.keys(_); keys.map(key => key + "=" + _[key]).join("; ")'
'foo=1; bar=2'
```

- The parsed JSON input is available as `_`
- Your expression is plain JavaScript, and supports multiple statements
- The result is the value of the last evaluated statement
- Each top-level property of the input object is also available globally (`foo` instead of `_.foo`)
- You can omit `_` as the first character of the expression (`.foo` is treated as `_.foo`)
- Use `--json` to get a raw JSON output
