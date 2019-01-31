const Database = require('better-sqlite3')
const fs = require('fs')
// setup logging
const winston = require('winston')

// need to create format to show timestamps? https://github.com/winstonjs/winston/issues/1175
const myFormat = winston.format.printf(info => {
  return `${info.timestamp} ${info.level}: ${info.message}\n`
})

// create 2 active file loggers, 1 for just errors, 1 for debugging
const logger = winston.createLogger({
  format: winston.format.combine(winston.format.timestamp(), myFormat),
  transports: [
    // use "Stream" vs "File" until https://github.com/winstonjs/winston/issues/1194#issuecomment-386327916
    // new winston.transports.File({filename: `${__dirname}/../error.log`, level: 'error'})
    //new winston.transports.File({filename: `${__dirname}/../combined.log`, level: 'debug'})
    new winston.transports.Stream({stream: fs.createWriteStream(`${__dirname}/../error.log`, {flags: 'a'}), level: 'error'}),
    new winston.transports.Stream({stream: fs.createWriteStream(`${__dirname}/../combined.log`, {flags: 'a'}), level: 'debug'})
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

// attempt to stringify objects and detect some objects that will return {} when stringified (e.g. some errors)
// https://github.com/winstonjs/winston/issues/1217
logger.mylog = (level, msg, ...rest) => {
  msg =
  typeof msg === 'undefined'
    ? 'why are you logging undefined msgs?!'
    : typeof msg === 'string' ? msg : typeof msg.message !== 'undefined' ? msg.message : JSON.stringify(msg)
  logger.log(level, msg, ...rest)
}

exports.logger = logger

exports.db = new Database(`${__dirname}/../../sql/cloud.db`)
const {prepare} = exports.db
exports.db.prepare = function() {
  logger.mylog('info', arguments[0])
  return prepare.apply(this, arguments)
}
