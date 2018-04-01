const {exec} = require('../src/common')

exports.execCmd = async (args = '') => {
  const cmd = `../bin/mcm ${args}`
  const result = exec(cmd, {cwd: __dirname}).catch(error => error)
  return result
}

// return a list of possible pairs for the given array
const choose2 = function r(arr) {
  const combos = []
  const len = arr.length
  if (len > 2) {
    for (let i = 1; i < len; i++) {
      combos.push([arr[0], arr[i]])
    }
    return combos.concat(choose2(arr.slice(1)))
  } else if (len === 2) {
    return [[arr[0], arr[1]]]
  } else {
    throw 'Array must have at least 2 elements'
  }
}
exports.choose2 = choose2

const ms1min = 1 * 60 * 1000
const ms5min = 5 * 60 * 1000
const ms15min = 15 * 60 * 1000

const verboseOpt = {opt: 'verbose', alias: 'v'}
const quietOpt = {opt: 'quiet', alias: 'q'}
const helpOpt = {opt: 'help', alias: 'h'}
const allOpt = {opt: 'all', alias: 'a'}
const commonValidOpts = [verboseOpt, quietOpt, helpOpt]
const listOfConflicts = [[verboseOpt.alias, quietOpt.alias]]
const validCommands = [
  {cmd: 'env:check-cert', alias: 'ec'},
  {cmd: 'env:delete', 
    validOpts: [{opt: 'inactive', alias: 'i'}],
    listOfConflicts: [['i','a','pid:env']]
  },
  {cmd: 'env:deploy', 
    validOpts: [{opt: 'expiring', alias: 'x'}],
    listOfConflicts: [['x','a','pid:env']],
    expectsAtLeast1: true
  },
  {cmd: 'env:exec', alias: 'ee', expectsAtLeast1: true},
  {cmd: 'env:get', alias: 'eg', expectsAtLeast1: true},
  {cmd: 'env:put', alias: 'ep', expectsAtLeast1: true},
  {cmd: 'env:smoke-test', alias: 'es'},
  {cmd: 'env:update', alias: 'eu'},
  {cmd: 'host:env-match', alias: 'he', expectsNoArgs: true},
  {cmd: 'host:update', alias: 'hu', 
    validOpts: [{opt: 'sample', alias: 's'}],
    listOfConflicts: [['s','a','pid:env']]
  },
  {cmd: 'project:find-failures', alias: 'pf'},
  {cmd: 'project:grant-gitlab', alias: 'pg'},
  {cmd: 'project:update', alias: 'pu'}
]

// add common opts
validCommands.forEach(cmd => {
  cmd.validOpts = commonValidOpts
    .concat(cmd.validOpts ? cmd.validOpts : [], cmd.cmd !== 'host:env-match' ? [allOpt] : [])
  cmd.listOfConflicts = listOfConflicts.concat(cmd.listOfConflicts ? cmd.listOfConflicts : [])
  cmd.timeout = ['env:smoke-test', 'env:deploy'].includes(cmd.cmd) ? ms5min : ms1min
})

exports.validCommands = validCommands