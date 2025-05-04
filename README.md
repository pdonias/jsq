# jsq

Like [`jq`](https://stedolan.github.io/jq/), but using plain JavaScript syntax.

## Install

```
npm i -g jsq-cli
```

## Usage

Access properties like `jq`:
```bash
$ echo '{ "foo": "bar" }' | jsq '.foo'
bar
```

Or use more complex expressions with JavaScript:
```bash
$ echo '{ "foo": "bar" }' | jsq "const keys = Object.keys($); keys.length"
1
```
