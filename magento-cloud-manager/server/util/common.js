const Database = require('better-sqlite3')
const winston = require('winston')

winston.add(winston.transports.File, {filename: `${__dirname}/../../log.json`})
exports.db = new Database(`${__dirname}/../../sql/cloud.db`)
const {prepare} = exports.db
exports.db.prepare = function() {
  winston.info(arguments[0])
  return prepare.apply(this, arguments)
}
