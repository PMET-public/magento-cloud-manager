#!/usr/bin/env node
const yargs = require('yargs')
const chalk = require('chalk')
const readline = require('readline')
const {readFileSync} = require('fs')

// be kind with our requests and don't abuse the API or servers
// remember p-limit expects an async function or a function that returns a promise
const pLimit = require('p-limit')

const {logger, showWhoAmI, allOpsSuccessTemplate, mixedSuccessTemplate} = require('../src/common')
const {updateHost, getSampleEnvs, updateEnvHostRelationships} = require('../src/host')
const {updateProject, getProjectsFromApi} = require('../src/project')
const {smokeTestApp, getUntestedEnvs} = require('../src/smoke-test')
const {searchActivitiesForFailures} = require('../src/activity')
const {addCloudProjectKeyToGitlabKeys} = require('../src/gitlab')
const {
  deleteInactiveEnvs,
  deleteEnv,
  execInEnv,
  redeployEnv,
  syncEnv,
  checkPublicUrlForExpectedAppResponse,
  getPathFromRemote,
  sendPathToRemoteTmpDir,
  getLiveEnvsAsPidEnvArr,
  deployEnvFromTar,
  rebuildAndRedeployUsingDummyFile,
  getExpiringPidEnvs,
  backup
} = require('../src/environment')
const {addUser, delUser} = require('../src/user')
const {getVar, setVar} = require('../src/variable')

const errorTxt = txt => chalk.bold.white.bgRed(txt)
const headerTxt = txt => chalk.yellow(txt)
const cmdTxt = txt => chalk.green(txt)

// Conflicting options with default values (or boolean values) https://github.com/yargs/yargs/issues/929#issuecomment-349494048
// Boolean arguments shouldn't accept values: https://github.com/yargs/yargs/issues/1077
const coercer = x => {
  if (typeof x === 'object' && x.length === 0) {
    return undefined
  }
  return x || undefined
}

const defaultAllOptions = {
  alias: 'all',
  type: 'boolean',
  coerce: coercer
}

const addSharedPidEnvOpts = (hasAllOpt = true) => {
  if (hasAllOpt) {
    yargs.option('a', {
      description: 'Apply to all active envs',
      conflicts: 'pid:env',
      ...defaultAllOptions
    })
  }
  yargs.positional('pid:env', {
    alias: 'pid',
    type: 'string',
    describe: 'A list of proj:env pairs. Omit ":env" if unneeded or to default to "master".',
    coerce: coercer
  })
  yargs.option('t', {
    alias: 'time',
    description: 'Time (in hours) to regard a prior run with the same params as still valid. "0" will force rerun.',
    type: 'number',
    default: 12
  })
}

const verifyOnlyArg = argv => {
  if (argv._.length > 1) {
    yargs.showHelp()
    // invoked by command handler so must explicitly invoke console
    console.error(errorTxt(`The "${argv._[0]}" command expects no additional args.`))
    process.exit(1)
  }
}

const verifyOnlyOneOf = (argv, args) => {
  if (args.filter(x => argv[x]).length !== 1) {
    yargs.showHelp()
    // invoked by command handler so must explicitly invoke console
    console.error(errorTxt(`The "${argv._[0]}" command requires additional args.`))
    process.exit(1)
  }
}

// apply a function to a list of ids (pid or pid:env)
const pLimitForEachHandler = async (limit, func, pidEnvs, additionalArgs = []) => {
  const curLimit = pLimit(limit)
  const promises = []
  pidEnvs.forEach((id, index, array) => {
    const args = id.split(':')
    if (args.length === 1) {
      args.push('master')
    }
    if (!/^[a-z0-9]{13}$/.test(args[0])) {
      logger.mylog('error', `Invalid project id: ${args[0]}`)
      process.exit(1)
    }
    if (/[~^:?*[\\]/.test(args[1])) {
      logger.mylog('error', `Invalid env id: ${args[1]}`)
      process.exit(1)
    }
    if (additionalArgs.length) {
      args.push(...additionalArgs)
    }
    promises.push(
      curLimit(async () => {
        logger.mylog('debug', `calling ${func.name}(${args.join(', ')})`)
        const result = await func(...args)
        logger.mylog('debug', `result of ${func.name}(${args.join(', ')}) is ${result}`)
        return result
      })
    )
  })
  const result = await Promise.all(promises)
  if (pidEnvs.size > 1) {
    const successful = result.filter(val => val).length
    const total = result.length
    if (successful === total) {
      logger.mylog('info', chalk.green(allOpsSuccessTemplate(total)))
    } else {
      logger.mylog('info', errorTxt(mixedSuccessTemplate(total, successful)))
    }
  }
  return result
}

const filterStillValidRuns = (time, func, pidEnvs, additionalArgs = []) => {
  const args = additionalArgs.length ? ', ' + additionalArgs.join(', ') : ''
  const regex = new RegExp(`^(20.*) debug: result of ${func.name}\\\(([^)]+${args})\\\)`) // eslint-disable-line
  const lines = readFileSync(`${__dirname}/../combined.log`, {encoding:'utf8'}).split('\n')
  let origSize = pidEnvs.size
  for (let line of lines) {
    const matches = line.match(regex)
    // check match was a valid result (not undefined) and within timeframe 
    if (matches && !/undefined$/.test(matches.input) && (new Date(matches[1])/1000 > new Date()/1000 - 3600 * time)) {
      // check if pidEnv is in our set (also check variation w/o ":master")
      if (pidEnvs.delete(matches[2].replace(', ',':')) || pidEnvs.delete(matches[2].replace(/, master(,|$)/,''))) {
        logger.mylog('debug', `Skipping ... ${func.name}(${matches[2]}${args}) in debug log within valid time.`)
        if (pidEnvs.size === 0) {
          break // all items have been removed
        }
      }
    }
  }
  if (origSize !== pidEnvs.size) {
    const diff = origSize - pidEnvs.size
    logger.mylog('info', `${pidEnvs.size === 0 ? 'All ' + diff : diff} item(s) skipped due to recent runs with ` +
      'same parameters. See debug output or log file for details. Use -t 0 to override.')
  }
  return pidEnvs
}

yargs
  .usage(cmdTxt('$0 <cmd> [args]'))
  .wrap(yargs.terminalWidth())
  .strict()
  .updateStrings({
    'Commands:': headerTxt('Commands:'),
    'Options:': headerTxt('Options:     ** Commands may have additional options. See <cmd> -h. **'),
    'Positionals:': headerTxt('Positionals:'),
    'Not enough non-option arguments: got %s, need at least %s': errorTxt(
      'Not enough non-option arguments: got %s, need at least %s'
    )
  })
  .alias('h', 'help')
  .check(arg => {
    if (!arg._.length) {
      yargs.showHelp()
    }
    if (arg.verbose) {
      logger.remove(logger.simpleConsole).add(logger.verboseConsole)
    } else if (arg.quiet) {
      logger.remove(logger.simpleConsole).add(logger.quietConsole)
    }
    return true
  }, true)
  .version(false)
  .option('v', {
    alias: 'verbose',
    description: 'Display debugging information',
    global: true,
    type: 'boolean',
    coerce: coercer
  })
  .option('q', {
    alias: 'quiet',
    description: 'Suppress normal output. Only display errors.',
    global: true,
    conflicts: 'v',
    type: 'boolean',
    coerce: coercer
  })

yargs.command(
  ['env:backup [pid:env...]', 'eb'],
  'Backup env(s)',
  yargs => {
    addSharedPidEnvOpts()
  },
  argv => {
    verifyOnlyOneOf(argv, ['a', 'pid:env'])
    let pidEnvs = new Set(argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'])
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, backup, pidEnvs)
    }
    pLimitForEachHandler(6, backup, pidEnvs)
  }
)
  
yargs.command(['env:check-public-url [pid:env...]', 'ec'], 'Check the public url of env(s) for expected app response', addSharedPidEnvOpts,
  argv => {
    verifyOnlyOneOf(argv, ['i', 'a', 'pid:env'])
    let pidEnvs = new Set(argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'])
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, checkPublicUrlForExpectedAppResponse, pidEnvs)
    }
    pLimitForEachHandler(6, checkPublicUrlForExpectedAppResponse, pidEnvs)
  }
)

yargs.command(
  ['env:delete [pid:env...]'],
  'Delete environment(s)',
  yargs => {
    addSharedPidEnvOpts(false)
    yargs.option('i', {
      alias: 'inactive',
      description: 'Delete all inactive envs across all projs',
      conflicts: ['pid:env'],
      type: 'boolean',
      coerce: coercer
    })
    yargs.option('yes', {
      description: 'Answer "yes" to prompt',
      type: 'boolean',
      coerce: coercer
    })
  },
  async argv => {
    verifyOnlyOneOf(argv, ['i', 'pid:env'])
    if (argv.inactive) {
      return pLimitForEachHandler(4, deleteInactiveEnvs, await getProjectsFromApi())
    } 
    let pidEnvs = new Set(argv['pid:env'])
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, deleteEnv, pidEnvs)
    }
    if (argv.yes) {
      pLimitForEachHandler(4, deleteEnv, pidEnvs)
    } else {
      const rl = readline.createInterface({input: process.stdin, output: process.stdout})
      rl.question(
        `${errorTxt('Are you sure you want to delete these envs:')} 
      ${Array.from(pidEnvs).join(' ')} ?\nTo continues, type 'yes': `,
        answer => {
          rl.close()
          if (answer === 'yes') {
            pLimitForEachHandler(4, deleteEnv, pidEnvs)
          }
        }
      )
    }
  }
)

yargs.command(
  ['env:deploy [tar] [pid:env...]'],
  'Redeploy or deploy env(s) using the optional provided tar file as the new git head',
  yargs => {
    addSharedPidEnvOpts(false)
    yargs.option('x', {
      alias: 'expiring',
      description: 'Redeploy envs with TLS certs that are about to expire (no other changes)',
      conflicts: ['tar', 'a', 'reset', 'force'],
      type: 'boolean',
      coerce: coercer
    })
    yargs.positional('tar', {
      type: 'string',
      describe:
        `A tar of the git HEAD to push. E.g.,\n${cmdTxt('\tgit archive --format=tar HEAD > head.tar')}` +
        '\nDon\'t forget any files needed that are not tracked in git. E.g.,\n  ' +
        cmdTxt('\ttar -rf head.tar auth.json'),
      normalize: true
    })
    yargs.option('reset', {
      description: 'Destructively reset an env before defore deploying. DATA WILL BE LOST.',
      type: 'boolean',
      coerce: coercer
    })
    yargs.option('force', {
      description: 'Force rebuild & redeploy as-is. No tar. Deploying via ssh if possible is faster (skips rebuild).',
      type: 'boolean',
      coerce: coercer
    })
    yargs.option('yes', {
      description: 'Answer "yes" to any prompt(s)',
      type: 'boolean',
      coerce: coercer
    })
  },
  argv => {
    if (argv.force) {
      // force does not use tar, so add 1st arg ("tar") to list of pidEnvs
      argv['pid:env'] = argv['pid:env'] || []
      argv['pid:env'].unshift(argv['tar'])
      argv['tar'] = undefined
    }
    verifyOnlyOneOf(argv, ['x', 'force', 'tar'])
    const additionalArgs = [argv.tar, argv.reset]
    if (argv.expiring) {
      return pLimitForEachHandler(4, redeployEnv, getExpiringPidEnvs())
    }
    let pidEnvs = new Set(argv['pid:env'])
    if (argv.force) {
      return pLimitForEachHandler(4, rebuildAndRedeployUsingDummyFile, pidEnvs)
    }
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, deployEnvFromTar, pidEnvs, additionalArgs)
    }
    if (argv.tar && !require('fs').existsSync(argv.tar)) {
      console.error(errorTxt(`Could not find file: ${argv.tar}`))
      process.exit(1)
    }
    if (argv.yes) {
      pLimitForEachHandler(4, deployEnvFromTar, pidEnvs, additionalArgs)
    } else {
      const rl = readline.createInterface({input: process.stdin, output: process.stdout})
      const question = argv.reset
        ? errorTxt('Are you sure you want to RESET and then deploy these envs:')
        : headerTxt('Are you sure you want to deploy to these envs:')
      rl.question(question + `\n${Array.from(pidEnvs).join(' ')} ?\nTo continues, type 'yes': `, answer => {
        rl.close()
        if (answer === 'yes') {
          pLimitForEachHandler(4, deployEnvFromTar, pidEnvs, additionalArgs)
        }
      })
    }
  }
)

yargs.command(
  ['env:exec <file> [pid:env...]', 'ee'],
  'Execute a file in env(s)',
  yargs => {
    yargs.positional('file', {
      type: 'string',
      describe: 'The full file path to copy to the remote env',
      normalize: true
    })
    addSharedPidEnvOpts()
  },
  argv => {
    verifyOnlyOneOf(argv, ['a', 'pid:env'])
    let pidEnvs = new Set(argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'])
    const additionalArgs = [argv.file]
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, execInEnv, pidEnvs, additionalArgs)
    }
    pLimitForEachHandler(6, execInEnv, pidEnvs, additionalArgs)
  }
)

yargs.command(
  ['env:get <remote-path> [pid:env...]', 'eg'],
  'Get a remote path (file or directory) in env(s)',
  yargs => {
    addSharedPidEnvOpts()
    yargs.positional('remote-path', {
      type: 'string',
      describe: 'The path to recursively copy from the remote env',
      normalize: true
    })
  },
  argv => {
    verifyOnlyOneOf(argv, ['a', 'pid:env'])
    let pidEnvs = new Set(argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'])
    const additionalArgs = [argv['remote-path']]
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, getPathFromRemote, pidEnvs, additionalArgs)
    }
    pLimitForEachHandler(6, getPathFromRemote, pidEnvs, additionalArgs)
  }
)

yargs.command(
  ['env:put <local-path> [pid:env...]', 'ep'],
  'Put a local path (file or directory) file in env(s) /tmp dir',
  yargs => {
    addSharedPidEnvOpts()
    yargs.positional('local-path', {
      type: 'string',
      describe: 'The path to send to the remote env /tmp dir',
      normalize: true
    })
  },
  argv => {
    verifyOnlyOneOf(argv, ['a', 'pid:env'])
    let pidEnvs = new Set(argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'])
    const additionalArgs = [argv['local-path']]
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, sendPathToRemoteTmpDir, pidEnvs, additionalArgs)
    }
    pLimitForEachHandler(6, sendPathToRemoteTmpDir, pidEnvs, additionalArgs)
  }
)

yargs.command(
  ['env:smoke-test [pid:env...]', 'es'],
  'Run smoke tests in env(s)',
  yargs => {
    addSharedPidEnvOpts()
    yargs.option('u', {
      alias: 'untested',
      description: 'Only test previously untested envs',
      conflicts: ['pid:env', 'a'],
      type: 'boolean',
      coerce: coercer
    })
  },
  argv => {
    verifyOnlyOneOf(argv, ['u', 'a', 'pid:env'])
    let pidEnvs = new Set(argv.all ? getLiveEnvsAsPidEnvArr() : argv.untested ? getUntestedEnvs() : argv['pid:env'])
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, smokeTestApp, pidEnvs)
    }
    pLimitForEachHandler(2, smokeTestApp, pidEnvs)
  }
)

yargs.command(
  ['env:sync [pid:env...]'],
  'Sync code with parent. N/A for master envs.',
  yargs => {
    addSharedPidEnvOpts(false)
  },
  argv => {
    // remove master envs
    let pidEnvs = new Set(argv['pid:env'].filter(x => !(!/:/.test(x) || /:master$/.test(x))))
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, syncEnv, pidEnvs)
    }
    pLimitForEachHandler(4, syncEnv, pidEnvs)
  }
)

yargs.command(
  ['host:env-match', 'he'],
  'Match envs to hosts based on shared system attributes',
  () => {},
  argv => {
    verifyOnlyArg(argv)
    updateEnvHostRelationships()
  }
)

yargs.command(
  ['host:update [pid:env...]', 'hu'],
  'Gather performance metrics of hosts via env(s)',
  yargs => {
    addSharedPidEnvOpts()
    yargs.option('s', {
      alias: 'sample',
      description: 'Only use 1 sample env per host to reduce load on servers',
      conflicts: ['pid:env', 'a'],
      type: 'boolean',
      coerce: coercer
    })
  },
  argv => {
    verifyOnlyOneOf(argv, ['s', 'a', 'pid:env'])
    let pidEnvs = new Set(argv.all ? getLiveEnvsAsPidEnvArr() : argv.sample ? getSampleEnvs() : argv['pid:env'])
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, updateHost, pidEnvs)
    }
    pLimitForEachHandler(4, updateHost, pidEnvs)
  }
)

yargs.command(
  ['project:find-failures [pid:env...]', 'pf'],
  'Query activity API by proj(s) to find envs that failed to deploy',
  addSharedPidEnvOpts,
  async argv => {
    verifyOnlyOneOf(argv, ['a', 'pid:env'])
    let pidEnvs = new Set(argv.all ? await getProjectsFromApi() : argv['pid:env'])
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, searchActivitiesForFailures, pidEnvs)
    }
    pLimitForEachHandler(4, searchActivitiesForFailures, pidEnvs)
  }
)

yargs.command(
  ['project:grant-gitlab [pid:env...]', 'pg'],
  'Grant access to proj(s) to all configured gitlab projects in .secrets.json',
  addSharedPidEnvOpts,
  async argv => {
    verifyOnlyOneOf(argv, ['a', 'pid:env'])
    let pidEnvs = new Set(argv.all ? await getProjectsFromApi() : argv['pid:env'])
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, addCloudProjectKeyToGitlabKeys, pidEnvs)
    }
    pLimitForEachHandler(6, addCloudProjectKeyToGitlabKeys, pidEnvs)
  }
)

yargs.command(['project:update [pid...]', 'pu'], 
  'Update projects\' info, users, and envs', addSharedPidEnvOpts, 
  async argv => {
    verifyOnlyOneOf(argv, ['a', 'pid'])
    let pidEnvs = new Set(argv.all ? await getProjectsFromApi() : argv['pid'])
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, updateProject, pidEnvs)
    }
    pLimitForEachHandler(6, updateProject, pidEnvs)
  }
)

yargs.command(
  ['user:add <email> <role> [pid...]', 'ua'],
  'Add user with email and role to projects',
  addSharedPidEnvOpts,
  async argv => {
    verifyOnlyOneOf(argv, ['a', 'pid'])
    let pidEnvs = new Set(argv.all ? await getProjectsFromApi() : argv['pid'])
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, addUser, pidEnvs)
    }
    const additionalArgs = [argv.email, argv.role]
    pLimitForEachHandler(4, addUser, pidEnvs, additionalArgs)
  }
)

yargs.command(
  ['user:delete <email> [pid...]', 'ud'],
  'Delete user with email from projects',
  addSharedPidEnvOpts,
  async argv => {
    verifyOnlyOneOf(argv, ['a', 'pid'])
    let pidEnvs = new Set(argv.all ? await getProjectsFromApi() : argv['pid'])
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, delUser, pidEnvs)
    }
    const additionalArgs = [argv.email]
    pLimitForEachHandler(4, delUser, pidEnvs, additionalArgs)
  }
)

yargs.command(
  ['variable:get <name> [pid...]', 'vg'],
  'Get var on projects\' envs',
  addSharedPidEnvOpts,
  async argv => {
    verifyOnlyOneOf(argv, ['a', 'pid'])
    let pidEnvs = new Set(argv.all ? await getProjectsFromApi() : argv['pid'])
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, getVar, pidEnvs)
    }
    const additionalArgs = [argv.name, argv.value]
    pLimitForEachHandler(4, getVar, pidEnvs, additionalArgs)
  }
)

yargs.command(
  ['variable:set <name> <value> [pid...]', 'vs'],
  'Set var to value on projects\' envs',
  addSharedPidEnvOpts,
  async argv => {
    verifyOnlyOneOf(argv, ['a', 'pid'])
    let pidEnvs = new Set(argv.all ? await getProjectsFromApi() : argv['pid'])
    if (argv.time) {
      pidEnvs = filterStillValidRuns(argv.time, setVar, pidEnvs)
    }
    const additionalArgs = [argv.name, argv.value]
    pLimitForEachHandler(4, setVar, pidEnvs, additionalArgs)
  }
)

;(async () => {
  await showWhoAmI() // force token refresh before parsing arg; should be < 1 sec
  yargs.argv
})()
