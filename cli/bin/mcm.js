#!/usr/bin/env node

const yargs = require('yargs')
const chalk = require('chalk')
const readline = require('readline');

// be kind with our requests and don't abuse the API or servers
// remember p-limit expects an async function or a function that returns a promise
const pLimit = require('p-limit')

const {logger, showWhoAmI, disallowedCmdTxt, allOpsSuccessTemplate, mixedSuccessTemplate} = require('../src/common')
const {updateHost, getSampleEnvs, updateEnvHostRelationships} = require('../src/host')
const {updateProject, getProjectsFromApi} = require('../src/project')
const {smokeTestApp} = require('../src/smoke-test')
const {searchActivitiesForFailures} = require('../src/activity')
const {addCloudProjectKeyToGitlabKeys} = require('../src/gitlab')
const {
  updateEnvironment,
  deleteInactiveEnvs,
  deleteEnv,
  execInEnv,
  redeployEnv,
  checkCertificate,
  getPathFromRemote,
  sendPathToRemoteTmpDir,
  getLiveEnvsAsPidEnvArr,
  deployEnvFromTar,
  getExpiringPidEnvs
} = require('../src/environment')

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

const addSharedPidEnvOpts = () => {
  yargs.positional('pid:env', {
    alias: 'pid',
    type: 'string',
    describe: 'A list of proj:env pairs. Omit ":env" if unneeded or to default to "master".',
    coerce: coercer
  })
  yargs.option('a', {
    description: 'Apply to all active envs',
    conflicts: 'pid:env',
    ...defaultAllOptions
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

const verifyOneOf = (argv, args) => {
  if (!args.filter(x => argv[x]).length) {
    yargs.showHelp()
    // invoked by command handler so must explicitly invoke console
    console.error(errorTxt(`The "${argv._[0]}" command requires additional args.`))
    process.exit(1)
  }
}

// apply a function to a list of ids (pid or pid:env) 
const pLimitForEachHandler = async (limit, arrOfIds, func, arrOfAdditionalArgs) => {
  const curLimit = pLimit(limit)
  const promises = []
  arrOfIds.forEach( id => {
    const args = id.split(':')
    if (args.length === 1 ) {
      args.push('master')
    } 
    if (arrOfAdditionalArgs && arrOfAdditionalArgs.length) {
      args.push(...arrOfAdditionalArgs)
    } 
    promises.push(
      curLimit(async () => {
        const result = func(...args)
        return result
      })
    )
  })
  const result = await Promise.all(promises)
  if (arrOfIds.length > 1) {
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
    coerce: coercer,
  })
  .option('q', {
    alias: 'quiet',
    description: 'Suppress normal output. Only display errors.',
    global: true,
    conflicts: 'v',
    type: 'boolean',
    coerce: coercer
  })

yargs.command(['env:check-cert [pid:env...]', 'ec'], 'Check the https cert of env(s)', addSharedPidEnvOpts, 
  argv => pLimitForEachHandler(4, argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'], checkCertificate)
)

yargs.command(
  ['env:delete [pid:env...]'],
  'Delete environment(s)',
  yargs => {
    yargs.positional('pid:env', {
      alias: 'pid',
      type: 'string',
      describe: 'A list of proj:env pairs. Omit ":env" if unneeded or to default to "master".',
      coerce: coercer
    })
    yargs.option('a', {
      description: 'Apply to all active envs',
      conflicts: 'pid:env',
      ...defaultAllOptions
    })
    yargs.option('i', {
      alias: 'inactive',
      description: 'Delete all inactive envs across all projs',
      conflicts: ['pid:env', 'a'],
      type: 'boolean',
      coerce: coercer
    })
    yargs.option('yes', {
      description: 'Answer "yes" to prompt',
      type: 'boolean',
      coerce: coercer
    })
  },
  async argv =>{
    verifyOneOf(argv, ['i', 'a', 'pid:env'])
    if (argv.all) {
      console.log(errorTxt(disallowedCmdTxt))
    } else if (argv.inactive) {
      pLimitForEachHandler(4, (await getProjectsFromApi()), deleteInactiveEnvs)
    } else if (argv.yes) {
      pLimitForEachHandler(4, argv['pid:env'], deleteEnv)
    } else {
      const rl = readline.createInterface({input: process.stdin, output: process.stdout });
      rl.question(`${errorTxt('Are you sure you want to delete these envs:')} 
      ${argv['pid:env'].join(' ')} ?\nTo continues, type 'yes': `, (answer) => {
        rl.close()
        if (answer === 'yes') {
          pLimitForEachHandler(4, argv['pid:env'], deleteEnv)
        }
      });
    }
  }
)

yargs.command(
  ['env:deploy [tar-file] [pid:env...]'],
  'Deploy env(s) using the provided tar file as the new git head',
  yargs => {
    yargs.option('x', {
      alias: 'expiring',
      description: 'Redeploy expiring envs without changes',
      conflicts: ['pid:env', 'a', 'reset'],
      type: 'boolean',
      coerce: coercer
    })
    yargs.positional('tar-file', {
      type: 'string',
      describe: `A tar of the git HEAD to push. E.g.,\n${cmdTxt('\tgit archive --format=tar HEAD > head.tar')}` +
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
      description: 'Force rebuild & redeploy. N.B. Deploying the existing container may be faster via ssh.',
      type: 'boolean',
      coerce: coercer
    })
    yargs.option('yes', {
      description: 'Answer "yes" to any prompt(s)',
      type: 'boolean',
      coerce: coercer
    })
    addSharedPidEnvOpts()
  },
  argv => {
    verifyOneOf(argv, ['x', 'a', 'pid:env'])
    if (argv.all) {
      console.log(errorTxt(disallowedCmdTxt))
    } else if (argv.expiring) {
      pLimitForEachHandler(4, getExpiringPidEnvs(), redeployEnv)
    } else if (argv.yes) {
      pLimitForEachHandler(4, argv['pid:env'], deployEnvFromTar, [argv['tar-file'], argv['reset'], argv['force']])
    } else {
      const rl = readline.createInterface({input: process.stdin, output: process.stdout });
      const question = argv['reset'] ? errorTxt('Are you sure you want to RESET and then deploy these envs:') :
        headerTxt('Are you sure you want to deploy to these envs:')
      rl.question(question + `\n${argv['pid:env'].join(' ')} ?\nTo continues, type 'yes': `, (answer) => {
        rl.close()
        if (answer === 'yes') {
          pLimitForEachHandler(4, argv['pid:env'], deployEnvFromTar, [argv['tar-file'], argv['reset'], argv['force']])
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
    verifyOneOf(argv, ['a', 'pid:env'])
    pLimitForEachHandler(6, argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'], execInEnv, [argv.file])
  }
)

yargs.command(
  ['env:get <remote-path> [pid:env...]', 'eg'],
  'Get a remote path (file or directory) in env(s)',
  yargs => {
    yargs.positional('remote-path', {
      type: 'string',
      describe: 'The path to recursively copy from the remote env',
      normalize: true
    })
    addSharedPidEnvOpts()
  },
  argv => {
    verifyOneOf(argv, ['a', 'pid:env'])
    pLimitForEachHandler(6, argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'], getPathFromRemote, [argv['remote-path']])
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
    verifyOneOf(argv, ['a', 'pid:env'])
    pLimitForEachHandler(6, argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'], sendPathToRemoteTmpDir, [argv['local-path']])
  }
)

yargs.command(['env:smoke-test [pid:env...]', 'es'], 
  'Run smoke tests in env(s)',
  yargs => {
    addSharedPidEnvOpts()
    yargs.option('t', {
      alias: 'time',
      description: 'Time (in hours) that a prior result is still valid. Value of 0 will force retest.',
      type: 'number',
      default: 24,
      coerce: coercer
    })
  }, 
  argv => {
    verifyOneOf(argv, ['a', 'pid:env'])
    pLimitForEachHandler(2, argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'], smokeTestApp, [argv['time']])
  }
)

yargs.command(['env:update [pid:env...]', 'eu'], 'Query API about env(s)', addSharedPidEnvOpts, 
  argv => {
    verifyOneOf(argv, ['a', 'pid:env'])
    pLimitForEachHandler(6, argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'], updateEnvironment)
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
    verifyOneOf(argv, ['s', 'a', 'pid:env'])
    const pidEnvs = argv.all ?
      getLiveEnvsAsPidEnvArr() :
      argv.sample ?
        getSampleEnvs() :
        argv['pid:env']
    pLimitForEachHandler(4, pidEnvs, updateHost)
  }
)

yargs.command(
  ['project:find-failures [pid:env...]', 'pf'],
  'Query activity API by proj(s) to find envs that failed to deploy',
  addSharedPidEnvOpts,
  async argv => {
    verifyOneOf(argv, ['a', 'pid:env'])
    pLimitForEachHandler(4, argv.all ? await getProjectsFromApi() : argv['pid:env'], searchActivitiesForFailures)
  }
)

yargs.command(
  ['project:grant-gitlab [pid:env...]', 'pg'],
  'Grant access to proj(s) to all configured gitlab projects in config.json',
  addSharedPidEnvOpts,
  async argv => {
    verifyOneOf(argv, ['a', 'pid:env'])
    pLimitForEachHandler(6, argv.all ? await getProjectsFromApi() : argv['pid:env'], addCloudProjectKeyToGitlabKeys)
  }
)

yargs.command(['project:update [pid:env...]', 'pu'], 'Query API about proj(s)', addSharedPidEnvOpts, 
  async argv => {
    verifyOneOf(argv, ['a', 'pid:env'])
    pLimitForEachHandler(6, argv.all ? await getProjectsFromApi() : argv['pid:env'], updateProject)
  }
)

;(async() => {
  await showWhoAmI() // force token refresh before parsing arg; should be < 1 sec
  yargs.argv
})()

