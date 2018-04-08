const {assert} = require('chai')
const {execCmd, choose2, validSubCommands} = require('./common')

let help = ''
const helpSubCmds = []
const helpAliases = []
const validNames = validSubCommands.map(c => c.name)
const validAliases = validSubCommands.filter(c => c.alias).map(c => c.alias)

const conflictToArg = (subCmdName, arg) => {
  const subCmd = validSubCommands.find(subCmd => subCmd.name === subCmdName)
  const {validOpts} = subCmd
  // check if arg is opt name (add "--", opt alias (add "-") or positional (return as is)
  const opt = validOpts.find(opt => opt.name === arg || opt.alias === arg)
  if (opt) {
    return (opt.name === arg ? '--' : '-') + arg
  }
  return arg
}

describe('testing the help', () => {
  before(() => {
    return execCmd().then(({stderr, stdout}) => {
      help = stderr
      help.split('\n').forEach(line => {
        const matches = line.match(/.*mcm (\w+:[-\w]+).*/)
        if (matches) {
          helpSubCmds.push(matches[1])
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

  it('help subcmds are in alpha order', () => {
    const alpha = helpSubCmds.slice().sort()
    assert.equal(JSON.stringify(alpha), JSON.stringify(helpSubCmds))
  })

  it('help subcmds match valid subcmds', () => {
    assert.equal(JSON.stringify(helpSubCmds), JSON.stringify(validNames))
  })

  it('help aliases match valid aliaes', () => {
    assert.equal(JSON.stringify(helpAliases), JSON.stringify(validAliases))
  })

  it('aliases are 2 letter combination of 1st and 2nd part of subcmd', () => {
    assert.equal(JSON.stringify(helpAliases), JSON.stringify(validAliases))
  })
})

validSubCommands.forEach(subCmd => {
  describe(`testing ${subCmd.name}`, () => {
    it('help matches all declared valid opts and opt aliases', () => {
      return execCmd(`${subCmd.name} -h`).then(({stderr, stdout}) => {
        const opts = []
        const optsAliases = []
        stdout.split('\n').forEach(line => {
          subCmd.name
          const optMatches = line.match(/^ {2}(-(\w), )?--(\w+)/)
          if (optMatches) {
            optsAliases.push(optMatches[2])
            opts.push(optMatches[3])
          }
        })
        const validOpts = subCmd.validOpts.map(opt => opt.name).sort()
        const validOptAliases = subCmd.validOpts.map(opt => opt.alias).sort()
        assert.equal(JSON.stringify(validOpts), JSON.stringify(opts.sort()))
        assert.equal(JSON.stringify(validOptAliases), JSON.stringify(optsAliases.sort()))
      })
    })

    if (typeof subCmd.requiresOneOf === 'undefined') {
      it('expects no args', () => {
        const strCmd = `${subCmd.name} dummy-arg`
        return execCmd(strCmd).then(({stderr, stdout}) => {
          assert.match(stderr, /expects no/)
        })
      })
    } else if (subCmd.requiresOneOf) {
      it('requires additional args', () => {
        const strCmd = `${subCmd.name}`
        return execCmd(strCmd).then(({stderr, stdout}) => {
          assert.match(stderr, /additional args|Not enough/)
        })
      })
    }

    subCmd.eachConflicts.forEach(conflicts => {
      const pairsOfConflicts = choose2(conflicts)
      pairsOfConflicts.forEach(pair => {
        it(`${pair[0]} and ${pair[1]} are mutually exclusive`, () => {
          const strCmd = `${subCmd.name} ${subCmd.requiresOneOf ? 'dummy-arg' : ''}` +
            ` ${conflictToArg(subCmd.name, pair[0])} ${conflictToArg(subCmd.name, pair[1])}`
          return execCmd(strCmd).then(({stderr, stdout}) => {
            assert.match(stderr, /mutually exclusive/)
          })
        })
      })
    })

    if (subCmd.firstConflictsWithRemaining) {
      subCmd.firstConflictsWithRemaining.forEach(conflicts => {
        const pairsOfConflicts = conflicts.slice(1).map(el => [conflicts[0], el])
        pairsOfConflicts.forEach(pair => {
          it(`${pair[0]} and ${pair[1]} are mutually exclusive`, () => {
            const strCmd = `${subCmd.name} ${subCmd.requiresOneOf ? 'dummy-arg' : ''}` +
              ` ${conflictToArg(subCmd.name, pair[0])} ${conflictToArg(subCmd.name, pair[1])}`
            return execCmd(strCmd).then(({stderr, stdout}) => {
              assert.match(stderr, /mutually exclusive/)
            })
          })
        })
      })
    }

  })
})
