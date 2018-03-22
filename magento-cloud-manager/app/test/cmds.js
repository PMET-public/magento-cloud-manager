// const assert = require('chai').assert
// const exec = require('util').promisify(require('child_process').exec)
// const execCmd = cmd => {
//   return exec(`../bin/mcm ${cmd}`, {cwd: __dirname}).catch(error => error)
// }

require('./options')

const validPid = 'xpwgonshm6qm2'
const validPidEnv = 'xpwgonshm6qm2:master'
const invalidPid = 'invalid-pid'
const invalidPidEnv = 'invalid-pid:master'

const stdCmdTests = (cmd, extraArgs = []) => {
  describe(`valid ${cmd} tests`, () => {
    it('has [debug], [info], and no [error]', async () => {
      const result = await execCmd(`${cmd} -v ${extraArgs.join(" ")} ${validPid}`)
      // accout for possible color codes in [loglevel]
      assert.match(result.stdout, /\[[^ ]*debug[^ ]*\]:/)
      assert.match(result.stdout, /\[[^ ]*info[^ ]*\]:/)
      assert.notMatch(result.stdout, /\[[^ ]*error[^ ]*\]:/)
    })
  })
  describe(`invalid ${cmd} tests`, async () => {
    it('has [debug], no [info], and [error]', async () => {
      const result = await execCmd(`${cmd} -v ${extraArgs.join(" ")} ${invalidPid}`)
      assert.match(result.stdout, /\[[^ ]*debug[^ ]*\]:/)
      assert.notMatch(result.stdout, /\[[^ ]*info[^ ]*\]:/)
      assert.match(result.stderr, /\[[^ ]*error[^ ]*\]:/)
    })
  })
}

describe('testing individual command functionality', () => {
  stdCmdTests('hu')
})