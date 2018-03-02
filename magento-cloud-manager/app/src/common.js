// setup logging
const winston = require('winston')
// create 2 active file loggers, 1 for just errors, 1 for debugging
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
      const {level, message, stderr} = info
      return `${stderr ? stderr : message}`
    })
  )
})
logger.add(logger.simpleConsole)
// create a verbose console logger for use with the --verbose option
logger.verboseConsole = new winston.transports.Console({
  level: 'debug',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.printf(info => {
      const {timestamp, level, message, ...args} = info

      const ts = timestamp.slice(0, 19).replace('T', ' ')
      return `${ts} [${level}]: ${message} ${Object.keys(args).length ? JSON.stringify(args, null, 2) : ''}`
    })
  )
})
exports.logger = logger

// setup DB
const Database = require('better-sqlite3')
const db = new Database(`${__dirname}/../../sql/cloud.db`)
const {prepare} = db
db.prepare = function() {
  logger.debug(arguments[0])
  return prepare.apply(this, arguments)
}
exports.db = db

const util = require('util')
const child_process = require('child_process')
const exec = util.promisify(child_process.exec)
exports.exec = function() {
  logger.debug(arguments[0])
  return exec.apply(this, arguments)
}

const pLimit = require('p-limit')
exports.apiLimit = pLimit(8)
exports.sshLimit = pLimit(4)
exports.MC_CLI = '~/.magento-cloud/bin/magento-cloud'

const fetch = require('node-fetch')
exports.fetch = function() {
  logger.debug(arguments[0])
  return fetch.apply(this, arguments)
}
