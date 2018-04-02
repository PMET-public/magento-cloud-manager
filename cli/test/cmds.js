const {assert} = require('chai')
const {regexToMatchAllOpsSuccess, regexToMatchMixedSuccess, regexToMatchDisallowed} = require('../src/common')
const {execCmd, validCommands} = require('./common')
const {writeFileSync, unlink} = require('fs')

// require('./options')

const validPid = 'ugwphl3msex5e'
const validPidEnv = 'dx7mnl3a22cou:master'
const invalidPid = 'invalid-pid'
const invalidPidEnv = 'invalid-pid:master'

const getCmdWithInvalidPid = (cmd, extraArgs = []) => {
  return `${cmd} -v ${extraArgs.join(' ')} ${invalidPidEnv}`
}

const getCmdWithValidPid = (cmd, extraArgs = []) => {
  return `${cmd} -v ${extraArgs.join(' ')} ${validPid}`
}

const getCmdWithMultipleValidPids = (cmd, extraArgs = []) => {
  return `${cmd} -v ${extraArgs.join(' ')} ${validPid} ${validPidEnv}`
}

const getCmdWithMixedPids = (cmd, extraArgs = []) => {
  return `${cmd} -v ${extraArgs.join(' ')} ${validPid} ${validPidEnv} ${invalidPid}`
}

const sEpoch = Math.floor(new Date() / 1000)
const tmpShFile = `/tmp/${sEpoch}.sh`
const tmpSqlFile = `/tmp/${sEpoch}.sql`
const validRemoteFile = '/var/log/deploy.log'

const testCmd = (cmdStr, resultTester, AssertionMsg,  timeout) => {
  it(cmdStr, async () => {
    const result = await execCmd(cmdStr)
    assert(resultTester(result), AssertionMsg)
  }).timeout(timeout)
}

const infoRegex = /(\[[^ ]*info[^ ]*\]:.*)/g
const debugRegex = /(\[[^ ]*debug[^ ]*\]:.*)/g
const errorRegex = /(\[[^ ]*error[^ ]*\]:.*)/g

const invalidTester = result => {
  const {stdout, stderr} = result
  result = stdout.match(debugRegex) && !stdout.match(infoRegex) && stderr.match(errorRegex)
  return result
}
const invalidTestMsg = 'should have [debug] and [error] but no [info] output'

const simpleValidTester = result => {
  const {stdout, stderr} = result
  return stdout.match(debugRegex) && stdout.match(infoRegex) && !stderr.match(errorRegex)
}
const validTestMsg = 'should have [debug] and [info] but no [error] output'

const multipleValidTester = result => {
  const {stdout} = result
  return stdout.match(regexToMatchAllOpsSuccess)
}

const mixedValidTester = result => {
  const {stdout} = result
  return stdout.match(regexToMatchMixedSuccess)
}
const mixedTestMsg = 'expect 1 failure and 2 successes'

const disallowedTester = result => {
  const {stdout} = result
  return stdout.match(regexToMatchDisallowed)
}
const disallowedTestMsg = 'disallow all for this cmd'

describe('invalid tests', () => {

  validCommands.forEach(cmd => {
    if (['env:delete', 'env:deploy', 'host:env-match'].includes(cmd.cmd)) {
      return
    }
    if (cmd.expectsAtLeast1) {
      testCmd(getCmdWithInvalidPid(cmd.cmd, ['dummy-arg']), invalidTester, invalidTestMsg, cmd.timeout)
    } else {
      testCmd(getCmdWithInvalidPid(cmd.cmd), invalidTester, invalidTestMsg, cmd.timeout)
    }
  })

})
/*
describe('test 1 valid pid, multiple valid pids, and a mix of valid and invalid pids', () => {

  before(() => {
    writeFileSync(tmpShFile, '#!/bin/bash\necho "hello world"')
    writeFileSync(tmpSqlFile, 'select 1 from dual')
  })

  validCommands.reverse().forEach(cmd => {
    // test delete & deploy separately later
    if (['env:delete', 'env:deploy'].includes(cmd.cmd)) {
      return
    }
    if (cmd.expectsNoArgs) {
      testCmd(`${cmd.cmd} -v`, simpleValidTester, validTestMsg, cmd.timeout)
      return
    }
    switch (cmd.cmd) {
    case 'env:exec':
      testCmd(getCmdWithValidPid(cmd.cmd, [tmpShFile]), simpleValidTester, validTestMsg, cmd.timeout)
      testCmd(getCmdWithValidPid(cmd.cmd, [tmpSqlFile]), simpleValidTester, validTestMsg, cmd.timeout)
      testCmd(getCmdWithMultipleValidPids(cmd.cmd, [tmpShFile]), multipleValidTester, validTestMsg, cmd.timeout)
      testCmd(getCmdWithMultipleValidPids(cmd.cmd, [tmpSqlFile]), multipleValidTester, validTestMsg, cmd.timeout)
      testCmd(getCmdWithMixedPids(cmd.cmd, [tmpShFile]), mixedValidTester, mixedTestMsg, cmd.timeout)
      testCmd(getCmdWithMixedPids(cmd.cmd, [tmpSqlFile]), mixedValidTester, mixedTestMsg, cmd.timeout)
      break;
    case 'env:get':
      testCmd(getCmdWithValidPid(cmd.cmd, [validRemoteFile]), simpleValidTester, validTestMsg, cmd.timeout)
      testCmd(getCmdWithMultipleValidPids(cmd.cmd, [validRemoteFile]), multipleValidTester, validTestMsg, cmd.timeout)
      testCmd(getCmdWithMixedPids(cmd.cmd, [validRemoteFile]), mixedValidTester, mixedTestMsg, cmd.timeout)
      break;
    case 'env:put':
      testCmd(getCmdWithValidPid(cmd.cmd, [tmpSqlFile]), simpleValidTester, validTestMsg, cmd.timeout)
      testCmd(getCmdWithMultipleValidPids(cmd.cmd, [tmpSqlFile]), multipleValidTester, validTestMsg, cmd.timeout)
      testCmd(getCmdWithMixedPids(cmd.cmd, [tmpSqlFile]), mixedValidTester, mixedTestMsg, cmd.timeout)
      break;
    default: 
      testCmd(getCmdWithValidPid(cmd.cmd), simpleValidTester, validTestMsg, cmd.timeout)
      testCmd(getCmdWithMultipleValidPids(cmd.cmd), multipleValidTester, validTestMsg, cmd.timeout)
      testCmd(getCmdWithMixedPids(cmd.cmd), mixedValidTester, mixedTestMsg, cmd.timeout)
    }
  })

  after(() => {
    unlink(tmpShFile)
    unlink(tmpSqlFile)
  })

})
*/
describe('test various batch and "--all" options', () => {

  before(() => {
    writeFileSync(tmpShFile, '#!/bin/bash\necho "hello world"')
    writeFileSync(tmpSqlFile, 'select 1 from dual')
  })

  // with many -a operations, the -v will exceed the stdout buffer, so drop it
  validCommands.reverse().forEach(cmd => {
    if (cmd.cmd === 'host:env-match') { // no "--all" option
      return
    }
    switch (cmd.cmd) {
    case 'env:delete':
    case 'env:deploy':
      testCmd(`${cmd.cmd} -a`, disallowedTester, disallowedTestMsg, cmd.allTimeout)
      break;
    case 'env:exec':
      // testCmd(`${cmd.cmd} -a ${tmpShFile}`, multipleValidTester, validTestMsg, cmd.allTimeout)
      // testCmd(`${cmd.cmd} -a ${tmpSqlFile}`, multipleValidTester, validTestMsg, cmd.allTimeout)
      break;
    case 'env:get':
      // testCmd(`${cmd.cmd} -a ${validRemoteFile}`, multipleValidTester, validTestMsg, cmd.allTimeout)
      break;
    case 'env:put':
      // testCmd(`${cmd.cmd} -a ${tmpSqlFile}`, multipleValidTester, validTestMsg, cmd.allTimeout)
      break;
    case 'host:upate':
      testCmd(`${cmd.cmd} -s`, multipleValidTester, validTestMsg, cmd.allTimeout)
      // falls through
    default:
      // testCmd(`${cmd.cmd} -a`, multipleValidTester, validTestMsg, cmd.allTimeout)
    }
  })

  after(() => {
    unlink(tmpShFile)
    unlink(tmpSqlFile)
  })

})
