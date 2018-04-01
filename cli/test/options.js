const {assert} = require('chai')
const {execOutputHandler} = require('../src/common')
const {execCmd, choose2} = require('./common')

const verboseOpt = {opt: 'verbose', alias: 'v'}
const quietOpt = {opt: 'quiet', alias: 'q'}
const helpOpt = {opt: 'help', alias: 'h'}
const allOpt = {opt: 'all', alias: 'a'}
const commonValidOpts = [verboseOpt, quietOpt, helpOpt]
const listOfConflicts = [[verboseOpt.alias, quietOpt.alias]]
const validCommands = [
  {cmd: 'env:check-cert', alias: 'ec'},
  {cmd: 'env:delete', 
    validOpts: [{opt: 'inactive', alias: 'i'}],
    listOfConflicts: [['i','a','pid:env']]
  },
  {cmd: 'env:deploy', 
    validOpts: [{opt: 'expiring', alias: 'x'}],
    listOfConflicts: [['x','a','pid:env']],
    expectsAtLeast1: true
  },
  {cmd: 'env:exec', alias: 'ee', expectsAtLeast1: true},
  {cmd: 'env:get', alias: 'eg', expectsAtLeast1: true},
  {cmd: 'env:put', alias: 'ep', expectsAtLeast1: true},
  {cmd: 'env:smoke-test', alias: 'es'},
  {cmd: 'env:update', alias: 'eu'},
  {cmd: 'host:env-match', alias: 'he', expectsNoArgs: true},
  {cmd: 'host:update', alias: 'hu', 
    validOpts: [{opt: 'sample', alias: 's'}],
    listOfConflicts: [['s','a','pid:env']]
  },
  {cmd: 'project:find-failures', alias: 'pf'},
  {cmd: 'project:grant-gitlab', alias: 'pg'},
  {cmd: 'project:update', alias: 'pu'}
]

// add common opts
validCommands.forEach(cmd => {
  cmd.validOpts = commonValidOpts
    .concat(cmd.validOpts ? cmd.validOpts : [], cmd.cmd !== 'host:env-match' ? [allOpt] : [])
  cmd.listOfConflicts = listOfConflicts.concat(cmd.listOfConflicts ? cmd.listOfConflicts : [])
})

const dummyArgs = 'dummy-arg1 dummy-arg2 dummy-arg3 dummy-arg4'
let help = ''
const helpCmds = []
const helpAliases = []

describe('testing the help', () => {

  before(() => {
    return execCmd()
      .then(({stderr, stdout}) => {
        help = stderr
        help.split('\n').forEach(line => {
          const matches = line.match(/.*mcm (\w+:[-\w]+).*/)
          if (matches) {
            helpCmds.push(matches[1])
            const aliasMatch = matches[0].match(/\[aliases: (.*)]/)
            if (aliasMatch) {
              helpAliases.push(aliasMatch[1])
            }
          }
        })
      })
  })

  it('default cmd is help', async () => {
    const result = await execCmd('-h')
    assert.equal(help, result.stdout)
    assert.match(help, /-h, --help/)
  })

  it('help cmds are in alpha order', () =>{
    const alpha = helpCmds.slice().sort()
    assert.equal(JSON.stringify(alpha), JSON.stringify(helpCmds))
  })

  it('help cmds match valid cmds', () =>{
    const validCmds = validCommands.map(c => c.cmd)
    assert.equal(JSON.stringify(helpCmds), JSON.stringify(validCmds))
  })

  it('help aliases match valid aliaes', () =>{
    const validAliases = validCommands.filter(c => c.alias).map(c => c.alias)
    assert.equal(JSON.stringify(helpAliases), JSON.stringify(validAliases))
  })

  it('aliases are 2 letter combination of 1st and 2nd part of cmd', () =>{
    const validAliases = validCommands.filter(c => c.alias).map(c => c.alias)
    assert.equal(JSON.stringify(helpAliases), JSON.stringify(validAliases))
  })

/*
  // describe('the all option', () => {
  //   it('either cmd has "--all" opt or not', () => {
  //     assert.equal(combinedCmdsWrtAllOpt.size, cmdsWithAllOpt.length + cmdsWithoutAllOpt.length)
  //   })
  //   it('every cmd accounted for WRT "--all" opt', () => {
  //     assert.equal(combinedCmdsWrtAllOpt.size, validCommands.length)
  //   })
  //   cmdsWithAllOpt.forEach(cmd => {
  //     it(`${cmd} "--all" opt exists and is equal to "-a"`, async () => {
  //       const result = await execCmd(`${cmd} -h`)
  //       assert.match(result.stdout, /-a, --all/)
  //     })
  //     it(`${cmd} "-a" can not take additional arguments`, async () => {
  //       const result = await execCmd(`${cmd} -a ${dummyArgs}`)
  //       assert.match(result.stderr, /mutually exclusive/)
  //     })
  //     it(`${cmd} without "-a" requires additional arguments`, async () => {
  //       const result = await execCmd(`${cmd}`)
  //       assert.match(result.stderr, /additional arg|Not enough non-option arguments/)
  //     })
  //   })
  //   cmdsWithoutAllOpt.forEach(cmd => {
  //     it(`${cmd} has no "-a" opt`, async () => {
  //       const result = await execCmd(`${cmd} -a`)
  //       assert.match(result.stderr, /Unknown argument.*a/)
  //     })
  //     it(`${cmd} takes no args`, async () => {
  //       const result = await execCmd(`${cmd} ${dummyArgs}`)
  //       assert.match(result.stderr, /command expects no/)
  //     })
  //   })
  // })
*/

})

validCommands.forEach(cmd => {

  describe(`testing ${cmd.cmd}`, () => {

    it('help matches all declared valid opts and opt aliases', () => {
      return execCmd(`${cmd.cmd} -h`)
        .then(({stderr, stdout}) => {
          const opts = []
          const optsAliases = []
          stdout.split('\n').forEach(line => {
            const optMatches = line.match(/^ {2}-(\w), --(\w+)/)
            if (optMatches) {
              opts.push(optMatches[2])
              optsAliases.push(optMatches[1])
            }
          })
          const validOpts = cmd.validOpts.map(opt => opt.opt).sort()
          const validOptAliases = cmd.validOpts.map(opt => opt.alias).sort()
          assert.equal(JSON.stringify(validOpts), JSON.stringify(opts.sort()))
          assert.equal(JSON.stringify(validOptAliases), JSON.stringify(optsAliases.sort()))
        })
    })

    if (cmd.expectsNoArgs) {
      it('expects no args', () => {
        const strCmd = `${cmd.cmd} dummy-arg`
        return execCmd(strCmd)
          .then(({stderr, stdout}) => {
            assert.match(stderr, /expects no/)
          })
      })
    } else if (cmd.expectsAtLeast1) {
      it('expects at least 1', () => {
        const strCmd = `${cmd.cmd}`
        return execCmd(strCmd)
          .then(({stderr, stdout}) => {
            assert.match(stderr, /at least 1/)
          })
      })
    }


    const conflictToArg = (conflict) => {
      return conflict.length == 1 ? '-' + conflict : conflict
    }
    cmd.listOfConflicts.forEach(conflicts => {
      const pairsOfConflicts = choose2(conflicts)
      pairsOfConflicts.forEach(pair => {
        it(`${pair[0]} and ${pair[1]} are mutually exclusive`, () => {
          const strCmd = `${cmd.cmd} ${cmd.expectsAtLeast1 ? 'dummy-arg' : ''} ${conflictToArg(pair[0])} ${conflictToArg(pair[1])}`
          return execCmd(strCmd)
            .then(({stderr, stdout}) => {
              assert.match(stderr, /mutually exclusive/)
            })
        })
      })
    })

  })

})

