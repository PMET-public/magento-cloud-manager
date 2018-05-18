const {assert} = require('chai')
const {regexToMatchAllOpsSuccess, regexToMatchMixedSuccess, regexToMatchDisallowed} = require('../src/common')
const {branchEnvFromMaster} = require('../src/environment')
const {execCmd, validSubCommands} = require('./common')
const {writeFileSync, unlinkSync} = require('fs')

require('./options')

const validPid = 'ugwphl3msex5e'
const validPidEnv = 'dx7mnl3a22cou:master'
const invalidPid = 'invalid-pid'
const invalidPidEnv = 'invalid-pid:master'

const getCmdWithInvalidPid = (cmd, extraArgs = []) => {
  return `${cmd} -t 0 -v ${extraArgs.join(' ')} ${invalidPidEnv}`
}

const getCmdWithValidPid = (cmd, extraArgs = []) => {
  return `${cmd} -t 0 -v ${extraArgs.join(' ')} ${validPid}`
}

const getCmdWithMultipleValidPids = (cmd, extraArgs = []) => {
  return `${cmd} -t 0 -v ${extraArgs.join(' ')} ${validPid} ${validPidEnv}`
}

const getCmdWithMixedPids = (cmd, extraArgs = []) => {
  return `${cmd} -t 0 -v ${extraArgs.join(' ')} ${validPid} ${validPidEnv} ${invalidPid}`
}

const sEpoch = Math.floor(new Date() / 1000)
const tmpShFile = `/tmp/${sEpoch}.sh`
const tmpSqlFile = `/tmp/${sEpoch}.sql`
const validRemoteFile = '/var/log/deploy.log'

const testCmd = (cmdStr, resultTester, AssertionMsg, timeout = 15000) => {
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
  validSubCommands.forEach(subCmd => {
    if (['env:delete', 'env:deploy', 'host:env-match'].includes(subCmd.name)) {
      return
    }
    testCmd(getCmdWithInvalidPid(subCmd.name, 
      Array(subCmd.numOfRequiredNonListArgs ? subCmd.numOfRequiredNonListArgs : 0).fill('dummy-arg')), invalidTester, invalidTestMsg, subCmd.timeout)
  })
})


describe('test 1 valid pid, multiple valid pids, and a mix of valid and invalid pids', () => {

  before(() => {
    writeFileSync(tmpShFile, '#!/bin/bash\necho "hello world"')
    writeFileSync(tmpSqlFile, 'select 1 from dual')
  })

  validSubCommands.reverse().forEach(subCmd => {
    // test delete & deploy separately later
    if (['env:delete', 'env:deploy'].includes(subCmd.name)) {
      return
    }
    if (subCmd.numOfRequiredNonListArgs === 0) {
      testCmd(`${subCmd.name} -v`, simpleValidTester, validTestMsg, subCmd.timeout)
      return
    }
    switch (subCmd.name) {
    case 'env:exec':
      testCmd(getCmdWithValidPid(subCmd.name, [tmpShFile]), simpleValidTester, validTestMsg, subCmd.timeout)
      testCmd(getCmdWithValidPid(subCmd.name, [tmpSqlFile]), simpleValidTester, validTestMsg, subCmd.timeout)
      testCmd(getCmdWithMultipleValidPids(subCmd.name, [tmpShFile]), multipleValidTester, validTestMsg, subCmd.timeout)
      testCmd(getCmdWithMultipleValidPids(subCmd.name, [tmpSqlFile]), multipleValidTester, validTestMsg, subCmd.timeout)
      testCmd(getCmdWithMixedPids(subCmd.name, [tmpShFile]), mixedValidTester, mixedTestMsg, subCmd.timeout)
      testCmd(getCmdWithMixedPids(subCmd.name, [tmpSqlFile]), mixedValidTester, mixedTestMsg, subCmd.timeout)
      break;
    case 'env:get':
      testCmd(getCmdWithValidPid(subCmd.name, [validRemoteFile]), simpleValidTester, validTestMsg, subCmd.timeout)
      testCmd(getCmdWithMultipleValidPids(subCmd.name, [validRemoteFile]), multipleValidTester, validTestMsg, subCmd.timeout)
      testCmd(getCmdWithMixedPids(subCmd.name, [validRemoteFile]), mixedValidTester, mixedTestMsg, subCmd.timeout)
      break;
    case 'env:put':
      testCmd(getCmdWithValidPid(subCmd.name, [tmpSqlFile]), simpleValidTester, validTestMsg, subCmd.timeout)
      testCmd(getCmdWithMultipleValidPids(subCmd.name, [tmpSqlFile]), multipleValidTester, validTestMsg, subCmd.timeout)
      testCmd(getCmdWithMixedPids(subCmd.name, [tmpSqlFile]), mixedValidTester, mixedTestMsg, subCmd.timeout)
      break;
    default: 
      testCmd(getCmdWithValidPid(subCmd.name), simpleValidTester, validTestMsg, subCmd.timeout)
      testCmd(getCmdWithMultipleValidPids(subCmd.name), multipleValidTester, validTestMsg, subCmd.timeout)
      testCmd(getCmdWithMixedPids(subCmd.name), mixedValidTester, mixedTestMsg, subCmd.timeout)
    }
  })

  after(() => {
    unlinkSync(tmpShFile)
    unlinkSync(tmpSqlFile)
  })

})


describe('test various batch and "--all" options', () => {
  before(() => {
    writeFileSync(tmpShFile, '#!/bin/bash\necho "hello world"')
    writeFileSync(tmpSqlFile, 'select 1 from dual')
  })

  // list test individually to ease enabling/disabling them via commenting b/c they can be time consuming
  // with many -a operations, the -v will exceed the stdout buffer, so drop it

  //testCmd('env:check-web -a', multipleValidTester, validTestMsg, 1000 * 60 * 15)
  testCmd('env:delete -a', disallowedTester, disallowedTestMsg)
  testCmd('env:delete -i', multipleValidTester, validTestMsg, 1000 * 60 * 2)
  testCmd('env:deploy -a dummy-tar-file', disallowedTester)
  //testCmd('env:deploy -x', )

  testCmd(`env:exec -a ${tmpShFile}`, multipleValidTester, validTestMsg, 1000 * 60 * 60 * 2)
  testCmd(`env:exec -a ${tmpSqlFile}`, multipleValidTester, validTestMsg, 1000 * 60 * 60 * 2)
  testCmd(`env:get -a ${validRemoteFile}`, multipleValidTester, validTestMsg, 1000 * 60 * 60 * 2)
  testCmd(`env:put -a ${tmpSqlFile}`, multipleValidTester, validTestMsg, 1000 * 60 * 60 * 2)
  testCmd('env:smoke-test -a', multipleValidTester, validTestMsg, 1000 * 60 * 15)

  testCmd('env:update -a', multipleValidTester, validTestMsg, 1000 * 60 * 15)
  testCmd('host:upate -s', multipleValidTester, validTestMsg, 1000 * 60 * 2)

  testCmd('host:upate -a', multipleValidTester, validTestMsg, 1000 * 60 * 15)
  testCmd('project:find-failures -a', multipleValidTester, validTestMsg, 1000 * 60 * 30)

  testCmd('project:grant-gitlab -a', multipleValidTester, validTestMsg, 1000 * 60 * 5)
  testCmd('project:update -a', multipleValidTester, validTestMsg, 1000 * 60 * 5)

  after(() => {
    unlinkSync(tmpShFile)
    unlinkSync(tmpSqlFile)
  })
})

// https://stackoverflow.com/questions/41949895/how-to-set-timeout-on-before-hook-in-mocha
describe('branch sample env, deploy to it, then delete it', function() {
  this.timeout(1000 * 60 * 15)

  const envName = Math.floor(new Date() / 1000)

  before(() => {
    return branchEnvFromMaster('xpwgonshm6qm2', envName)
  })

  testCmd(`env:deploy ref.tar xpwgonshm6qm2:${envName}`, multipleValidTester, validTestMsg, 1000 * 60 * 2)
  testCmd(`env:delete --yes xpwgonshm6qm2:${envName}`, multipleValidTester, validTestMsg, 1000 * 60 * 2)
})
