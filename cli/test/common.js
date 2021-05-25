const {exec} = require('../src/common')

const execCmd = async (args = '') => {
  const cmd = `../bin/mcm ${args}`
  const result = exec(cmd, {cwd: __dirname}).catch(error => error)
  return result
}
exports.execCmd = execCmd

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
// const ms30min = 30 * 60 * 1000
// const ms2hrs = 120 * 60 * 1000

// terminology https://stackoverflow.com/questions/36495669/difference-between-terms-option-argument-and-parameter
const verboseOpt = {name: 'verbose', alias: 'v'}
const quietOpt = {name: 'quiet', alias: 'q'}
const helpOpt = {name: 'help', alias: 'h'}
const allOpt = {name: 'all', alias: 'a'}
const timeOpt = {name: 'time', alias: 't'}
const commonValidOpts = [verboseOpt, quietOpt, helpOpt]
const validSubCommands = [
  {name: 'cloud:gen-css', alias: 'cg', numOfRequiredNonListArgs: 0},
  {name: 'env:backup', alias: 'eb'},
  {name: 'env:check-app-version', alias: 'ea'},
  {name: 'env:check-web-status', alias: 'ew'},
  {
    name: 'env:delete',
    validOpts: [{name: 'inactive', alias: 'i'}, {name: 'yes'}],
    listOpts: ['i']
  },
  {
    name: 'env:deploy',
    validOpts: [{name: 'expiring', alias: 'x'}, {name: 'yes'}, {name: 'reset'}, {name: 'force'}],
    listOpts: ['x'],
    firstConflictsWithRemaining: [['x', 'tar', 'reset', 'force']]
  },
  {name: 'env:exec', alias: 'ee', numOfRequiredNonListArgs: 1},
  {name: 'env:get', alias: 'eg', numOfRequiredNonListArgs: 1},
  {name: 'env:put', alias: 'ep', numOfRequiredNonListArgs: 1},
  {name: 'env:report-web-status', alias: 'er'},
  {name: 'env:set-ip-access', alias: 'ei'},
  {
    name: 'env:smoke-test', 
    alias: 'es',
    validOpts: [{name: 'untested', alias: 'u'}],
  }
  ,
  {
    name: 'env:sync',
    validOpts: [{name: 'data'}],
    listOpts: ['data']
  },
  {name: 'host:env-match', alias: 'he', numOfRequiredNonListArgs: 0},
  {
    name: 'host:update',
    alias: 'hu',
    validOpts: [{name: 'sample', alias: 's'}],
    listOpts: ['s']
  },
//  {name: 'project:find-failures', alias: 'pf'},
//  {name: 'project:grant-gitlab', alias: 'pg'},
  {name: 'project:update', alias: 'pu'},
  {name: 'user:add', alias: 'ua', numOfRequiredNonListArgs: 2},
  {name: 'user:delete', alias: 'ud', numOfRequiredNonListArgs: 1},
  {name: 'variable:get', alias: 'vg', numOfRequiredNonListArgs: 1},
  {name: 'variable:set', alias: 'vs', numOfRequiredNonListArgs: 2}
]

// add common opts
validSubCommands.forEach(subCmd => {
  subCmd.eachConflicts = [[verboseOpt.alias, quietOpt.alias]].concat(subCmd.eachConflicts || [])
  subCmd.timeout = ['env:smoke-test', 'env:deploy'].includes(subCmd.name) ? ms5min : ms1min
  subCmd.validOpts = subCmd.validOpts || []
  subCmd.validOpts.push(...commonValidOpts)
  if (!/host:env-match|cloud:gen-css|env:report-web-status/.test(subCmd.name)) {
    subCmd.validOpts.push(timeOpt)
    if (!/env:delete|env:deploy|env:sync/.test(subCmd.name)) {
      subCmd.validOpts.push(allOpt)
      subCmd.requiresOneOf = ['a', 'pid:env'].concat(subCmd.listOpts || [])
    } else {
      subCmd.requiresOneOf = ['pid:env'].concat(subCmd.listOpts || [])
    }
    subCmd.eachConflicts.push(subCmd.requiresOneOf)
  }
})

exports.validSubCommands = validSubCommands
