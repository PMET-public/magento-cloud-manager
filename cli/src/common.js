// setup logging
const winston = require('winston')

// need to create format to show timestamps? https://github.com/winstonjs/winston/issues/1175
const myFormat = winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)

// create 2 active file loggers, 1 for just errors, 1 for debugging
const logger = winston.createLogger({
  format: winston.format.combine(winston.format.timestamp(), myFormat),
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
      const {message, stderr} = info
      // strip outer double quotes and escaping \" in  message for console output
      return `${message ? message.replace(/^"|"$/g, '').replace(/\\"/g, '"') + '\n' : ''}${
        stderr ? 'STDERR:\n' + stderr : ''
      }`
    })
  )
})
logger.add(logger.simpleConsole)

// create a verbose console logger for the --verbose option
logger.verboseConsole = new winston.transports.Console({
  level: 'debug',
  stderrLevels: ['error'],
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.printf(info => {
      const {timestamp, level, message, stderr, ...args} = info

      const ts = timestamp.slice(0, 19).replace('T', ' ')
      return `${ts} [${level}]: ${message ? message + '\n' : ''}${stderr ? 'STDERR:\n' + stderr : ''} ${
        Object.keys(args).length ? JSON.stringify(args, null, 2) : ''
      }`
    })
  )
})

// create a quiet console logger for the --quiet option
logger.quietConsole = new winston.transports.Console({
  level: 'error',
  format: winston.format.combine(
    winston.format.printf(info => {
      const {message, stderr} = info
      return `${message ? message + '\n' : ''}${stderr ? 'STDERR:\n' + stderr : ''}`
    })
  )
})

// attempt to stringify objects and detect some objects that will return {} when stringified (e.g. some errors)
// https://github.com/winstonjs/winston/issues/1217
logger.mylog = (level, msg, ...rest) => {
  msg = typeof msg === 'undefined' ?
    'why are you logging undefined msgs?!' :
    typeof msg === 'string' ?
      msg :
      typeof msg.message !== 'undefined' ?
        msg.message :
        JSON.stringify(msg)
  logger.log(level, msg, ...rest)
}

exports.logger = logger

// setup DB
const Database = require('better-sqlite3')
const db = new Database(`${__dirname}/../../sql/cloud.db`)
const {prepare} = db

// can not use arrow func b/c "=>" does not have its own arguments
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions
db.prepare = function() {
  logger.mylog('debug', arguments[0])
  return prepare.apply(this, arguments)
}
exports.db = db

const exec = require('util').promisify(require('child_process').exec)
// can not use arrow func b/c "=>" does not have its own arguments
exports.exec = function() {
  logger.mylog('debug', arguments[0])
  return exec.apply(this, arguments)
}

const execOutputHandler = ({stdout, stderr}) => {
  if (stderr) {
    // an error hasn't been thrown yet, so just log the error output if it shouldn't be filtered
    // a subsequent handler may parse stderr and decide to throw one
    const nonErrorRegexes = [] // non-error "errors"
    const result = nonErrorRegexes.filter(regex => regex.test(stderr))
    if (result.length === 0) { // stderr did not match any filtering regex
      logger.mylog('error', stderr)
    }
  }
  if (stdout) {
    logger.mylog('debug', stdout)
  }
  return {stdout, stderr}
}
exports.execOutputHandler = execOutputHandler

const MC_CLI = '~/.magento-cloud/bin/magento-cloud'
exports.MC_CLI = MC_CLI

const fetch = require('node-fetch')
exports.fetch = function() {
  logger.mylog('debug', arguments[0])
  return fetch.apply(this, arguments)
}

// this helper function takes out formatted as "column_name value\n"
// and inserts it into the specified table
exports.parseFormattedCmdOutputIntoDB = (stdout, table, additionalKeys = [], additionalVals = []) => {
  const cmdOutput = stdout
    .trim()
    .split('\n')
    .map(row => row.split(/[ \t](.+)/)) // split on 1st whitespace char
  const keys = cmdOutput.map(row => row[0]).concat(additionalKeys)
  const vals = cmdOutput.map(row => row[1]).concat(additionalVals)
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${'?, '.repeat(keys.length).slice(0, -2)})`
  const result = db.prepare(sql).run(...vals)
  logger.mylog('debug', result)
  return result
}

// this method serves 2 purposes
// 1) it shows in the debug log who the cmd is being run as
// 2) more importantly though it can be used as a trivial cmd to renew a potentially expired cloud token
// without it, an expired token will cause all parallel triggered cmds to fail
// until the first that triggers a renewal completes its renewal
exports.showWhoAmI = async () => {
  const cmd = `${MC_CLI} auth:info --property mail`
  const result = await exec(cmd)
    .then(execOutputHandler)
    .catch(error => logger.mylog('error', error))
  return result
}
