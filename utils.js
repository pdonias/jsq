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
}
