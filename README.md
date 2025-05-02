# jsq

Like [`jq`](https://stedolan.github.io/jq/), but using plain JavaScript syntax.

## Install

From NPM:
```
npm i -g jsq-cli
```

or from source:
```
git clone git@github.com/pdonias/jsq
cd jsq
npm i -g .
```

## Usage

```bash
$ echo '{ "foo": "bar" }' | jsq 'this.foo'
bar
```

Supports JavaScript syntax:
```bash
$ echo '{ "foo": "bar" }' | jsq "const keys = Object.keys(this); keys.length"
1
```
