const {assert} = require('chai')
const {execCmd} = require('./common')

const verboseOpt = {opt: 'verbose', alias: 'v'}
const quietOpt = {opt: 'quiet', alias: 'q'}
const helpOpt = {opt: 'help', alias: 'h'}
const allOpt = {opt: 'all', alias: 'a'}
const commonValidOpts = [verboseOpt, quietOpt, helpOpt]
const inCompatibleOpts = [verboseOpt, quietOpt]
const validCommands = [
  {cmd: 'env:check-cert', alias: 'ec'},
  {cmd: 'env:delete', 
    validOpts: [{opt: 'inactive', alias: 'i'}],
    inCompatibleOpts: ['i','a','pid:env']
  },
  {cmd: 'env:deploy', 
    validOpts: [{opt: 'expiring', alias: 'x'}],
    inCompatibleOpts: ['x','a','pid:env']
  },
  {cmd: 'env:exec', alias: 'ee'},
  {cmd: 'env:get', alias: 'eg'},
  {cmd: 'env:put', alias: 'ep'},
  {cmd: 'env:smoke-test', alias: 'es'},
  {cmd: 'env:update', alias: 'eu'},
  {cmd: 'host:env-match', alias: 'he'},
  {cmd: 'host:update', alias: 'hu', 
    validOpts: [{opt: 'sample', alias: 's'}],
    inCompatibleOpts: ['s','a','pid:env']
  },
  {cmd: 'project:find-failures', alias: 'pf'},
  {cmd: 'project:grant-gitlab', alias: 'pg'},
  {cmd: 'project:update', alias: 'pu'}
]

// add common opts
validCommands.forEach(cmd => {
  cmd.validOpts = commonValidOpts.concat(cmd.validOpts, cmd.cmd !== 'host:env-match' ? [allOpt] : [])
  cmd.inCompatibleOpts = inCompatibleOpts.concat(cmd.inCompatibleOpts)
})

const invalidCmd = 'asdfasdfasdf'
const dummyArgs = 'dummy-arg1 dummy-arg2 dummy-arg3 dummy-arg4'

// add all opt for relevant
const cmdsWithAllOpt = ['hu', 'pu', 'pg', 'eu', 'ee', 'ec', 'er', 'es']
const cmdsWithoutAllOpt = ['he', 'ed', 'af']
const combinedCmdsWrtAllOpt = new Set(cmdsWithAllOpt.concat(cmdsWithoutAllOpt))
validCommands.forEach(cmd => {
  if (cmdsWithAllOpt.indexOf(cmd.alias) !== -1) {
    cmd.validOpts.push(allOpt)
  }
})

describe('testing the CLI ...', () => {
  describe('valid cmds', () => {
    it('cmds and aliases are equal', async () => {
      const help = await execCmd()
      validCommands.forEach(({cmd, alias}) => {
        assert.match(help.stderr, new RegExp(`${cmd}.*aliases: ${alias}`))
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
    it('er "-x" and "-a" opts are incompatible', async () => {
      const result = await execCmd(`er -xa ${dummyArgs}`)
      assert.match(result.stderr, /mutually exclusive/)
    })
  })
})
