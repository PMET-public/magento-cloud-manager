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

const validTests = fullCmd => {
  describe(`valid tests: ${fullCmd}`, () => {
    it('has [debug], [info], and no [error]', async () => {
      const result = await execCmd(fullCmd)
      console.log('[info]', result.stdout.replace(/[\s\S]+(info.*)[\s\S]*/g,'$1'))
      // accout for possible color codes in [loglevel]
      assert.match(result.stdout, /\[[^ ]*debug[^ ]*\]:/)
      assert.match(result.stdout, /\[[^ ]*info[^ ]*\]:/)
      assert.notMatch(result.stdout, /\[[^ ]*error[^ ]*\]:/)
    })
  })
}

const invalidTests = fullCmd => {
  describe(`invalid tests: ${fullCmd}`, () => {
    it('has [debug], no [info], and [error]', async () => {
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

  const cmdsToTest = ['hu', 'pu', 'pg', 'eu', 'ec', 'es']
  cmdsToTest.forEach(cmd => {
    validTests(getCmdWithValidPid(cmd))
    invalidTests(getCmdWithInvalidPid(cmd))
  })

  validTests(`ee -v ${tmpShFile} ${validPid}`)
  validTests(`ee -v ${tmpSqlFile} ${validPid}`)
  invalidTests(`ee -v ${tmpShFile} ${invalidPid}`)
  invalidTests(`ee -v ${tmpSqlFile} ${invalidPid}`)

  // 'er',


 after(() => {
    unlink(tmpShFile)
    unlink(tmpSqlFile)
 })
})