const Database = require('better-sqlite3')
const winston = require('winston')

const logger = winston.createLogger({
  transports: [
    new winston.transports.File({filename: `${__dirname}/../error.log`, level: 'error'}),
    new winston.transports.File({filename: `${__dirname}/../debug.log`, level: 'debug'})
  ]
})

// create a simple console logger and add it
logger.simpleConsole = new winston.transports.Console({
  level: 'info',
  format: winston.format.combine(
    winston.format.printf(info => {
      const {levelIgnoreMe, message, stderr} = info
      return `${message ? message + '\n' : ''}${stderr ? 'STDERR:\n' + stderr : ''}`
    })
  )
})
logger.add(logger.simpleConsole)

exports.logger = logger

exports.db = new Database(`${__dirname}/../../sql/cloud.db`)
const {prepare} = exports.db
exports.db.prepare = function() {
  winston.info(arguments[0])
  return prepare.apply(this, arguments)
}
