const assert = require('chai').assert
const exec = require('util').promisify(require('child_process').exec)
const verboseOpt = {opt: 'verbose', alias: 'v'}
const quietOpt = {opt: 'quiet', alias: 'q'}
const helpOpt = {opt: 'help', alias: 'h'}
const allOpt = {opt: 'all', alias: 'a'}
const commonValidOpts = [verboseOpt, quietOpt, helpOpt]

const inCompatibleOpts = [verboseOpt, quietOpt]

let validCommands = [
  {cmd: 'host:update', alias: 'hu'},
  {cmd: 'host:sample', alias: 'hs'},
  {cmd: 'host:project-match', alias: 'hp'},
  {cmd: 'project:update', alias: 'pu'},
  {cmd: 'project:grant-gitlab', alias: 'pg'},
  {cmd: 'env:update', alias: 'eu'},
  {cmd: 'env:exec', alias: 'ee'},
  {cmd: 'env:redeploy', alias: 'er'},
  {cmd: 'env:smoke-test', alias: 'es'},
  {cmd: 'env:delete-inactive', alias: 'ed'},
  {cmd: 'activity:find-failures', alias: 'af'}
]

// add common opts
validCommands.forEach(cmd => {
  cmd.validOpts = commonValidOpts
  cmd.inCompatibleOpts = inCompatibleOpts
})

// add all opt for relevant
cmdsWithAllOpt = ['hu', 'pu', 'pg', 'eu', 'ee', 'er', 'es']
cmdsWithoutAllOpt = ['hs', 'hp', 'ed', 'af']
validCommands.forEach(cmd => {
  if (cmdsWithAllOpt.indexOf(cmd.alias) !== -1) {
    cmd.validOpts.push(allOpt)
  }
})

const execCmd = cmd => {
  return exec(`../bin/mcm ${cmd}`, {cwd: __dirname}).catch(error => error)
}

describe('valid cmds', () => {
  validCommands.forEach(({cmd, alias}) => {
    it(`alias ${alias} should be equal ${cmd}`, async () => {
      cmd = await execCmd(`${cmd} -h`)
      alias = await execCmd(`${alias} -h`)
      assert.equal(cmd.stdout, alias.stdout)
    })
  })
})

describe('the all option', () => {
  const combined = new Set(cmdsWithAllOpt.concat(cmdsWithoutAllOpt))
  it('either cmd has "--all" opt or not', () => {
    assert.equal(combined.size, cmdsWithAllOpt.length + cmdsWithoutAllOpt.length)
  })
  it('every cmd accounted for', () => {
    assert.equal(combined.size, validCommands.length)
  })
  cmdsWithAllOpt.forEach(cmd => {
    it(`all opt exists for ${cmd}`, async () => {
      assert.match((await execCmd(`${cmd} -h`)).stdout, /--all/)
    })
  })
  cmdsWithoutAllOpt.forEach(cmd => {
    it(`all opt does NOT exist for ${cmd}`, async () => {
      assert.match((await execCmd(`${cmd} -a`)).stderr, /Unknown argument.*a/)
    })
  })
})

describe('invalid cmd', () => {
  const invalidCmd = 'asdfasdfasdf'
  it(`cmd "${invalidCmd}" should not exist`, async () => {
    assert.match((await execCmd(invalidCmd)).stderr, new RegExp(`Unknown argument.*${invalidCmd}`))
  })
})
