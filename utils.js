const fs = require('fs').promises

module.exports = {
  readStdin() {
    return new Promise((resolve, reject) => {
      let body = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', chunk => {
        if (process.env.DEBUG === '1') {
          process.stderr.write(chunk)
        }
        body += chunk
      })
      process.stdin.on('end', () => resolve(body))
      process.stdin.on('error', reject)
      process.on('SIGINT', function onSigint() {
        if (process.env.DEBUG === '1') {
          console.error('\nReceived SIGINT, ending input')
        }
        process.stdin.emit('end')
        process.off('SIGINT', onSigint)
      })
    })
  },

  async fileExists(path) {
    try {
      await fs.access(path)
      return true
    } catch {
      return false
    }
  },

  parse(text) {
    if (text == null || typeof text !== 'string' || text.trim() === '') {
      return text
    }

    try {
      return JSON.parse(text)
    } catch (err) {
      if (!(err instanceof SyntaxError)) {
        throw err
      }

      try {
        // Support NDJSON
        return text
          .trim()
          .split('\n')
          .map(line => JSON.parse(line))
      } catch (err) {
        if (!(err instanceof SyntaxError)) {
          throw err
        }

        return text
      }
    }

    try {
      inputObject = input === undefined || input.trim() === '' ? undefined : JSON.parse(input)
    } catch {
      // Support NDJSON
      inputObject = input
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
    }
  },
}
