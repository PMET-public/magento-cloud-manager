const assert = require('chai').assert
const {execCmd} = require('./common')

const verboseOpt = {opt: 'verbose', alias: 'v'}
const quietOpt = {opt: 'quiet', alias: 'q'}
const helpOpt = {opt: 'help', alias: 'h'}
const allOpt = {opt: 'all', alias: 'a'}
const commonValidOpts = [verboseOpt, quietOpt, helpOpt]
const inCompatibleOpts = [verboseOpt, quietOpt]
const validCommands = [
  {cmd: 'host:update', alias: 'hu'},
  {cmd: 'host:sample', alias: 'hs'},
  {cmd: 'host:project-match', alias: 'hp'},
  {cmd: 'project:update', alias: 'pu'},
  {cmd: 'project:grant-gitlab', alias: 'pg'},
  {cmd: 'env:update', alias: 'eu'},
  {cmd: 'env:exec', alias: 'ee'},
  {cmd: 'env:check-cert', alias: 'ec'},
  {cmd: 'env:redeploy', alias: 'er'},
  {cmd: 'env:smoke-test', alias: 'es'},
  {cmd: 'env:delete-inactive', alias: 'ed'},
  {cmd: 'activity:find-failures', alias: 'af'}
]
const invalidCmd = 'asdfasdfasdf'
const dummyArgs = 'dummy-arg1 dummy-arg2 dummy-arg3 dummy-arg4'

// add common opts
validCommands.forEach(cmd => {
  cmd.validOpts = commonValidOpts
  cmd.inCompatibleOpts = inCompatibleOpts
})

// add all opt for relevant
cmdsWithAllOpt = ['hu', 'pu', 'pg', 'eu', 'ee', 'ec', 'er', 'es']
cmdsWithoutAllOpt = ['hs', 'hp', 'ed', 'af']
const combinedCmdsWrtAllOpt = new Set(cmdsWithAllOpt.concat(cmdsWithoutAllOpt))
validCommands.forEach(cmd => {
  if (cmdsWithAllOpt.indexOf(cmd.alias) !== -1) {
    cmd.validOpts.push(allOpt)
  }
})

describe('testing the CLI ...', () => {
  describe('valid cmds', () => {
    validCommands.forEach(({cmd, alias}) => {
      it(`alias ${alias} equals ${cmd}`, async () => {
        cmd = await execCmd(`${cmd} -h`)
        alias = await execCmd(`${alias} -h`)
        assert.equal(cmd.stdout, alias.stdout)
      })
    })
  })

  describe('invalid cmd', () => {
    it(`cmd "${invalidCmd}" should not exist`, async () => {
      const result = await execCmd(invalidCmd)
      assert.match(result.stderr, new RegExp(`Unknown argument.*${invalidCmd}`))
    })
  })

  describe('the all option', () => {
    it('either cmd has "--all" opt or not', () => {
      assert.equal(combinedCmdsWrtAllOpt.size, cmdsWithAllOpt.length + cmdsWithoutAllOpt.length)
    })
    it('every cmd accounted for WRT "--all" opt', () => {
      assert.equal(combinedCmdsWrtAllOpt.size, validCommands.length)
    })
    cmdsWithAllOpt.forEach(cmd => {
      it(`${cmd} "--all" opt exists and is equal to "-a"`, async () => {
        const result = await execCmd(`${cmd} -h`)
        assert.match(result.stdout, /-a, --all/)
      })
      it(`${cmd} "-a" can not take additional arguments`, async () => {
        const result = await execCmd(`${cmd} -a ${dummyArgs}`)
        assert.match(result.stderr, /mutually exclusive/)
      })
      it(`${cmd} without "-a" requires additional arguments`, async () => {
        const result = await execCmd(`${cmd}`)
        assert.match(result.stderr, /additional arg|Not enough non-option arguments/)
      })
    })
    cmdsWithoutAllOpt.forEach(cmd => {
      it(`${cmd} has no "-a" opt`, async () => {
        const result = await execCmd(`${cmd} -a`)
        assert.match(result.stderr, /Unknown argument.*a/)
      })
      it(`${cmd} takes no args`, async () => {
        const result = await execCmd(`${cmd} ${dummyArgs}`)
        assert.match(result.stderr, /command expects no/)
      })
    })
  })

  describe('incompatible opts', () => {
    validCommands.forEach(cmd => {
      it(`${cmd.alias} "-v" and "-q" opts are incompatible`, async () => {
        const result = await execCmd(`${cmd.alias} -vq ${dummyArgs}`)
        assert.match(result.stderr, /mutually exclusive/)
      })
    })
    it(`er "-x" and "-a" opts are incompatible`, async () => {
      const result = await execCmd(`er -xa ${dummyArgs}`)
      assert.match(result.stderr, /mutually exclusive/)
    })
  })
})

