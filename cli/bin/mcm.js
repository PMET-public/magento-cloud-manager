#!/usr/bin/env node

const yargs = require('yargs')
const chalk = require('chalk')

// be kind with our requests and don't abuse the API or servers
// remember p-limit expects an async function or a function that returns a promise
const pLimit = require('p-limit')

const {logger, showWhoAmI} = require('../src/common')
const {updateHost, getSampleEnvs, updateEnvHostRelationships} = require('../src/host')
const {updateProject, getProjectsFromApi} = require('../src/project')
const {smokeTestApp} = require('../src/smoke-test')
const {searchActivitiesForFailures} = require('../src/activity')
const {addCloudProjectKeyToGitlabKeys} = require('../src/gitlab')
const {
  updateEnvironment,
  deleteInactiveEnvs,
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
      logger.mylog('info', chalk.green(`All ${total} operations successful.`))
    } else {
      logger.mylog('info', errorTxt(total - successful + ' operation(s) failed.') + chalk.green(` ${successful} succeeded.`))
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
    type: 'boolean',
    coerce: coercer,
    conflicts: 'v'
  })

yargs.command(['env:check-cert [pid:env...]', 'ec'], 'Check the https cert of env(s)', addSharedPidEnvOpts, argv =>
  pLimitForEachHandler(8, argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'], checkCertificate)
)

yargs.command(
  ['env:delete [pid:env...]'],
  'Delete environment(s)',
  yargs => {
    addSharedPidEnvOpts()
    yargs.option('i', {
      alias: 'inactive',
      description: 'Delete all inactive envs across all projs',
      conflicts: 'pid:env',
      coerce: coercer
    })
  },
  async argv =>{
    if (argv.all) {
      console.log('Are you crazy?!')
    } else if (argv.inactive) {
      pLimitForEachHandler(8, (await getProjectsFromApi()), deleteInactiveEnvs)
    }
  }
)

yargs.command(
  ['env:deploy [tar-file] [pid:env...]'],
  'Deploy env(s) using the provided tar file as the new git head',
  yargs => {
    addSharedPidEnvOpts()
    yargs.option('x', {
      alias: 'expiring',
      description: 'Redeploy expiring envs without changes',
      conflicts: ['pid:env', 'a', 'tar-file'],
      coerce: coercer
    })
    yargs.positional('tar-file', {
      type: 'string',
      describe: `A tar of the git HEAD to push. E.g.,\n${cmdTxt('\tgit archive --format=tar HEAD > head.tar')}` +
      '\nDon\'t forget any files needed that are not tracked in git. E.g.,\n  ' +
      cmdTxt('\ttar -rf head.tar auth.json'),
      normalize: true
    })
  },
  argv => {
    argv.all ?
      console.log('Are you crazy?!') :
      argv.expiring ?
        pLimitForEachHandler(8, getExpiringPidEnvs, redeployEnv):
        pLimitForEachHandler(8, argv['pid:env'], deployEnvFromTar, [argv['tar-file']])
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
  argv =>
    pLimitForEachHandler(8, argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'], execInEnv, [argv.file])
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
  argv =>
    pLimitForEachHandler(8, argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'], getPathFromRemote, [argv['remote-path']])
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
  argv => 
    pLimitForEachHandler(8, argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'], sendPathToRemoteTmpDir, [argv['local-path']])
)

yargs.command(['env:smoke-test [pid:env...]', 'es'], 'Run smoke tests in env(s)', addSharedPidEnvOpts, 
  argv => pLimitForEachHandler(8, argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'], smokeTestApp)
)

yargs.command(['env:update [pid:env...]', 'eu'], 'Query API about env(s)', addSharedPidEnvOpts, async argv => {
  if (argv.all) {
    await showWhoAmI() // if cloud token has expired, use this to renew before running parallel api queries
  }
  pLimitForEachHandler(8, argv.all ? getLiveEnvsAsPidEnvArr() : argv['pid:env'], updateEnvironment)
})

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
      coerce: coercer
    })
  },
  async argv => {
    const pidEnvs = argv.all ?
      getLiveEnvsAsPidEnvArr() :
      argv.sample ?
        getSampleEnvs() :
        argv['pid:env']
    await showWhoAmI()
    pLimitForEachHandler(8, pidEnvs, updateHost)
  }
)

yargs.command(
  ['project:find-failures [pid:env...]', 'pf'],
  'Query activity API by proj(s) to find envs that failed to deploy',
  addSharedPidEnvOpts,
  argv => pLimitForEachHandler(8, argv.all ? getProjectsFromApi() : argv['pid:env'], searchActivitiesForFailures)
)

yargs.command(
  ['project:grant-gitlab [pid:env...]', 'pg'],
  'Grant access to proj(s) to all configured gitlab projects in config.json',
  addSharedPidEnvOpts,
  argv => 
    pLimitForEachHandler(8, argv.all ? getProjectsFromApi() : argv['pid:env'], addCloudProjectKeyToGitlabKeys)
)

yargs.command(['project:update [pid:env...]', 'pu'], 'Query API about proj(s)', addSharedPidEnvOpts, async argv => {
  if (argv.all) {
    await showWhoAmI() // if cloud token has expired, use this to renew before running parallel api queries
  }
  pLimitForEachHandler(8, argv.all ? getProjectsFromApi() : argv['pid:env'], updateProject)
})

yargs.argv
