const {assert} = require('chai')
const {execCmd} = require('./common')
const {writeFileSync, unlink} = require('fs')

require('./options')

const validPid = 'xpwgonshm6qm2'
const validPidEnv = 'xpwgonshm6qm2:master'
const invalidPid = 'invalid-pid'
const invalidPidEnv = 'invalid-pid:master'

const getCmdWithValidPid = cmd => `${cmd} -v ${validPid}`
const getCmdWithInvalidPid = cmd => `${cmd} -v ${invalidPid}`

const ms15sec = 15*1000
const ms1min = 60*1000
const ms5min = 60*1000
const ms15min = 60*1000

const validTests = (fullCmd, timeout = ms15sec) => {
  describe(`valid tests: ${fullCmd}`, () => {
    it('has [debug], has [info], and has no [error]', async () => {
      const result = await execCmd(fullCmd)
      // console.log('[info]', result.stdout.replace(/[\s\S]+(info.*)[\s\S]*/g,'$1'))
      // accout for possible color codes in [loglevel]
      assert.match(result.stdout, /\[[^ ]*debug[^ ]*\]:/)
      // log level [info] is used for the final success msg
      assert.match(result.stdout, /\[[^ ]*info[^ ]*\]:/)
      assert.notMatch(result.stdout, /\[[^ ]*error[^ ]*\]:/)
    }).timeout(timeout)
  })
}

const invalidTests = fullCmd => {
  describe(`invalid tests: ${fullCmd}`, () => {
    it('has [debug], has no [info], and has [error]', async () => {
      const result = await execCmd(fullCmd)
      // accout for possible color codes in [loglevel]
      assert.match(result.stdout, /\[[^ ]*debug[^ ]*\]:/)
      assert.notMatch(result.stdout, /\[[^ ]*info[^ ]*\]:/)
      assert.match(result.stderr, /\[[^ ]*error[^ ]*\]:/)
    })
  })
}

describe('test quick (< 5 min max) commands operating on a single project', () => {
  // create files for testing 'env:exec'
  const sEpoch = Math.floor(new Date() / 1000)
  const tmpShFile = `/tmp/${sEpoch}.sh`
  const tmpSqlFile = `/tmp/${sEpoch}.sql`

  before(() => {
    writeFileSync(tmpShFile,'#!/bin/bash\necho "hello world"')
    writeFileSync(tmpSqlFile,'select 1 from dual')
 })

  const shortSimpleCmdsToTest = ['host:update', 'project:update', 'project:grant-gitlab', 'env:update', 'env:check-cert']
  shortSimpleCmdsToTest.forEach(cmd => {
    validTests(getCmdWithValidPid(cmd))
    invalidTests(getCmdWithInvalidPid(cmd))
  })

  validTests(`env:exec -v ${tmpShFile} ${validPid}`, ms1min)
  validTests(`env:exec -v ${tmpSqlFile} ${validPid}`, ms1min)
  invalidTests(`env:exec -v ${tmpShFile} ${invalidPid}`)
  invalidTests(`env:exec -v ${tmpSqlFile} ${invalidPid}`)

  validTests(`env:smoke-test -v ${validPid}`, ms5min)
  invalidTests(`env:smoke-test -v ${invalidPid}`)

 after(() => {
    unlink(tmpShFile)
    unlink(tmpSqlFile)
 })
})

describe('test quink (< 5 min max) commands operating on multiple projects', () => {
  validTests(`host:env-match -v`, ms1min)
  validTests(`host:update -vs`, ms1min)
  validTests(`host:update -va`, ms5min)
  validTests(`env:delete-inactive -v`, ms5min)
  validTests(`activity:find-failures -v`, ms5min)
})

describe('test long running commands (up to 15 min)', () => {
  validTests(`env:redeploy -v ${validPid}`, ms15min)
  invalidTests(`env:redeploy -v ${invalidPid}`)
})