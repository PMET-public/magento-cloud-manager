#!/usr/bin/env node

const yargs = require('yargs')
const chalk = require('chalk')
const {logger} = require('../src/common')
const {
  updateHost,
  updateHostsUsingAllLiveEnvs,
  updateHostsUsingSampleEnvs,
  updateEnvHostRelationships
} = require('../src/host')
const {updateProject, updateProjects} = require('../src/project')
const {
  updateEnvironment,
  updateAllCurrentProjectsEnvironmentsFromAPI,
  deleteInactiveEnvironments,
  execInEnv,
  redeployEnv,
  redeployExpiringEnvs,
  checkCertificate
} = require('../src/environment')
const {smokeTestApp, smokeTestAllLiveApps} = require('../src/smoke-test')
const {searchActivitiesForFailures} = require('../src/activity')
const {enableAllGitlabKeysForAllConfiguredProjects, addCloudProjectKeyToGitlabKeys} = require('../src/gitlab')

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

const addSharedPidOpts = () => {
  yargs.positional('pid', {
    type: 'string',
    describe: 'List of project IDs',
    coerce: coercer
  })
  yargs.option('a', {
    description: 'Apply to all projects',
    conflicts: 'pid',
    ...defaultAllOptions
  })
}

const addSharedPidEnvOpts = () => {
  yargs.positional('pid:env', {
    type: 'string',
    describe: 'A list of proj:env pairs. If not specified, env defaults to "master".',
    coerce: coercer
  })
  yargs.option('a', {
    description: 'Apply to all active envs',
    conflicts: 'pid:env',
    ...defaultAllOptions
  })
}

const verifyOnlyArg = (argv) => {
  if (argv._.length > 1) {
    yargs.showHelp()
    // invoked by command handler so must explicitly invoke console
    console.error(errorTxt(`The "${argv._[0]}" command expects no additional args.`))
    process.exit(1)
  }
}

const handleListCmd = (handler, isPairedList, listArgs, ...remainingArgs) => {
  // logic error
  if (typeof handler !== "function") {
    throw 'Handler must be a function'
  }
  // user error
  if (!listArgs || listArgs.length === 0) {
    yargs.showHelp()
    // invoked by command handler so must explicitly invoke console
    console.error(errorTxt('At least 1 additional arg is required.'))
    return false
  }
  listArgs.forEach(arg => {
    if (isPairedList) {
      const [pid, env] = arg.split(':')
      handler(pid, env ? env : 'master', ...remainingArgs)
    } else {
      handler(arg, ...remainingArgs)
    }
  })
}

yargs
  .usage(cmdTxt('$0 <cmd> [args]'))
  .wrap(yargs.terminalWidth())
  .strict()
  .updateStrings({
    'Commands:': headerTxt('Commands:'),
    'Options:': headerTxt('Global Options:     ** Commands may have additional options. See <cmd> -h. **'),
    'Positionals:': headerTxt('Positionals:'),
    'Not enough non-option arguments: got %s, need at least %s': errorTxt(
      'Not enough non-option arguments: got %s, need at least %s'
    )
  })
  .alias('h', 'help')
  .check(arg => {
    if (arg.verbose) {
      logger.remove(logger.simpleConsole).add(logger.verboseConsole)
    } else if (arg.quiet) {
      logger.remove(logger.simpleConsole).add(logger.quietConsole)
    }
    return true
  }, true)
  .option('v', {
    alias: 'verbose',
    description: 'Display debugging information',
    global: true,
    type: 'boolean',
    coerce: coercer,
    conflicts: 'q'
  })
  .option('q', {
    alias: 'quiet',
    description: 'Suppress normal output. Only display errors.',
    global: true,
    type: 'boolean',
    coerce: coercer,
    conflicts: 'v'
  })
  .demandCommand(1)

yargs.command(
  ['host:update [pid:env...]', 'hu'],
  'Update DB with info about hosts for provided projects',
  yargs => {
    addSharedPidEnvOpts()
    yargs.option('s', {
      alias: 'sample',
      description: 'Update DB with info about hosts using 1 sample env per host',
      conflicts: ['pid:env', 'a'],
      coerce: coercer
    })
  },
  argv => {
    if (argv.all) {
      updateHostsUsingAllLiveEnvs()
    } else if (argv.sample) {
      updateHostsUsingSampleEnvs()
    } else {
      handleListCmd(updateHost, true, argv['pid:env'])
    }
  }
)

yargs.command(
  ['host:env-match', 'he'],
  'Match hosts and envs',
  () => {},
  argv => {
    verifyOnlyArg(argv)
    updateEnvHostRelationships()
  }
)

yargs.command(
  ['project:update [pid...]', 'pu'],
  'Query API about projs',
  addSharedPidOpts,
  argv => {
    if (argv.all) {
      updateProjects()
    } else {
      handleListCmd(updateProject, false, argv['pid'])
    }
  }
)

yargs.command(
  ['project:grant-gitlab [pid...]', 'pg'],
  'Grant access to projs to all configured gitlab projects in config.json',
  addSharedPidOpts,
  argv => {
    if (argv.all) {
      enableAllGitlabKeysForAllConfiguredProjects()
    } else {
      handleListCmd(addCloudProjectKeyToGitlabKeys, false, argv['pid'])
    }
  }
)

yargs.command(
  ['env:update [pid:env...]', 'eu'],
  'Query API about env(s)',
  addSharedPidEnvOpts,
  argv => {
    if (argv.all) {
      updateAllCurrentProjectsEnvironmentsFromAPI()
    } else {
      handleListCmd(updateEnvironment, true, argv['pid:env'])
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
    if (argv.all) {
      console.log('not implemented yet')
    } else {
      handleListCmd(execInEnv, true, argv['pid:env'], argv.file)
    }
  }
)

yargs.command(
  ['env:check-cert [pid:env...]', 'ec'],
  'Check the https cert of env(s)',
  addSharedPidEnvOpts,
  argv => {
    if (argv.all) {
      console.log('not implemented yet')
    } else {
      handleListCmd(checkCertificate, true, argv['pid:env'])
    }
  }
)

yargs.command(
  ['env:redeploy [pid:env...]', 'er'],
  'Redeploy env(s) without changes',
  yargs => {
    addSharedPidEnvOpts()
    yargs.option('x', {
      alias: 'expiring',
      description: 'Redeploy expiring envs',
      conflicts: ['pid:env', 'a'],
      coerce: coercer
    })
  },
  argv => {
    if (argv.all) {
      console.log('not implemented yet')
    } else if (argv.expiring) {
      redeployExpiringEnvs()
    } else {
      handleListCmd(redeployEnv, true, argv['pid:env'])
    }
  }
)

yargs.command(
  ['env:smoke-test [pid:env...]', 'es'],
  'Run smoke tests in env(s)',
  addSharedPidEnvOpts,
  argv => {
    if (argv.all) {
      smokeTestAllLiveApps()
    } else {
      handleListCmd(smokeTestApp, true, argv['pid:env'])
    }
  }
)

yargs.command(
  ['env:delete-inactive', 'ed'],
  'Delete ALL inactive environments across all projs',
  () => {},
  argv => {
    verifyOnlyArg(argv)
    deleteInactiveEnvironments()
  }
)

yargs.command(
  ['activity:find-failures', 'af'],
  'Query activity API to find envs that failed to deploy',
  () => {},
  argv => {
    verifyOnlyArg(argv)
    searchActivitiesForFailures()
  }
)
logger.mylog('info','asdftest')
yargs.argv
