const {assert} = require('chai')
const {execCmd, choose2, validCommands} = require('./common')

let help = ''
const helpCmds = []
const helpAliases = []

describe('testing the help', () => {
  before(() => {
    return execCmd().then(({stderr, stdout}) => {
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

  it('help cmds are in alpha order', () => {
    const alpha = helpCmds.slice().sort()
    assert.equal(JSON.stringify(alpha), JSON.stringify(helpCmds))
  })

  it('help cmds match valid cmds', () => {
    const validCmds = validCommands.map(c => c.cmd)
    assert.equal(JSON.stringify(helpCmds), JSON.stringify(validCmds))
  })

  it('help aliases match valid aliaes', () => {
    const validAliases = validCommands.filter(c => c.alias).map(c => c.alias)
    assert.equal(JSON.stringify(helpAliases), JSON.stringify(validAliases))
  })

  it('aliases are 2 letter combination of 1st and 2nd part of cmd', () => {
    const validAliases = validCommands.filter(c => c.alias).map(c => c.alias)
    assert.equal(JSON.stringify(helpAliases), JSON.stringify(validAliases))
  })
})

validCommands.forEach(cmd => {
  describe(`testing ${cmd.cmd}`, () => {
    it('help matches all declared valid opts and opt aliases', () => {
      return execCmd(`${cmd.cmd} -h`).then(({stderr, stdout}) => {
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
        return execCmd(strCmd).then(({stderr, stdout}) => {
          assert.match(stderr, /expects no/)
        })
      })
    } else if (cmd.expectsAtLeast1) {
      it('expects at least 1', () => {
        const strCmd = `${cmd.cmd}`
        return execCmd(strCmd).then(({stderr, stdout}) => {
          assert.match(stderr, /at least 1/)
        })
      })
    }

    const conflictToArg = conflict => {
      return conflict.length == 1 ? '-' + conflict : conflict
    }
    cmd.listOfConflicts.forEach(conflicts => {
      const pairsOfConflicts = choose2(conflicts)
      pairsOfConflicts.forEach(pair => {
        it(`${pair[0]} and ${pair[1]} are mutually exclusive`, () => {
          const strCmd = `${cmd.cmd} ${cmd.expectsAtLeast1 ? 'dummy-arg' : ''} ${conflictToArg(
            pair[0]
          )} ${conflictToArg(pair[1])}`
          return execCmd(strCmd).then(({stderr, stdout}) => {
            assert.match(stderr, /mutually exclusive/)
          })
        })
      })
    })
  })
})
