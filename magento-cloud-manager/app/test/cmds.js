const {assert} = require('chai')
const {execCmd} = require('./common')
const {writeFileSync, unlink} = require('fs')

//require('./options')

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
      console.log('[info]', result.stdout.replace(/[\s\S]+(info.*)[\s\S]*/g,'$1'))
      // accout for possible color codes in [loglevel]
      assert.match(result.stdout, /\[[^ ]*debug[^ ]*\]:/)
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

describe('testing individual command functionality', () => {
  // create files for testing 'ee'
  const sEpoch = Math.floor(new Date() / 1000)
  const tmpShFile = `/tmp/${sEpoch}.sh`
  const tmpSqlFile = `/tmp/${sEpoch}.sql`

  before(() => {
    writeFileSync(tmpShFile,'#!/bin/bash\necho "hello world"')
    writeFileSync(tmpSqlFile,'select 1 from dual')
 })

  const shortSimpleCmdsToTest = ['hu', 'pu', 'pg', 'eu', 'ec']
  shortSimpleCmdsToTest.forEach(cmd => {
    validTests(getCmdWithValidPid(cmd))
    invalidTests(getCmdWithInvalidPid(cmd))
  })

  validTests(`ee -v ${tmpShFile} ${validPid}`, ms1min)
  validTests(`ee -v ${tmpSqlFile} ${validPid}`, ms1min)
  invalidTests(`ee -v ${tmpShFile} ${invalidPid}`)
  invalidTests(`ee -v ${tmpSqlFile} ${invalidPid}`)

  validTests(`es -v ${validPid}`, ms5min)
  invalidTests(`es -v ${invalidPid}`)

  validTests(`er -v ${validPid}`, ms15min)
  invalidTests(`er -v ${invalidPid}`)

 after(() => {
    unlink(tmpShFile)
    unlink(tmpSqlFile)
 })
})