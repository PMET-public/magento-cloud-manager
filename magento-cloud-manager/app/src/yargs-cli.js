const yargs = require('yargs')
const chalk = require('chalk')
const {logger} = require('../src/common')
const {
  updateHost,
  updateHostsUsingAllProjects,
  updateHostsUsingSampleProjects,
  updateProjectHostRelationships
} = require('../src/host')
const {updateProject, updateProjects} = require('../src/project')
const {
  updateEnvironment,
  updateAllCurrentProjectsEnvironmentsFromAPI,
  deleteInactiveEnvironments
} = require('../src/environment')
const {smokeTestApp, smokeTestAllLiveApps} = require('../src/smoke-test')
const {searchActivitiesForFailures} = require('../src/activity')

const errorTxt = txt => chalk.bold.white.bgRed(txt)
const headerTxt = txt => chalk.yellow(txt)
const cmdTxt = txt => chalk.green(txt)

// Conflicting options with default values (or boolean values) https://github.com/yargs/yargs/issues/929#issuecomment-349494048
// Boolean arguments shouldn't accept values: https://github.com/yargs/yargs/issues/1077
const coercer = x => x || undefined

yargs
  .usage(cmdTxt('$0 <cmd> [args]'))
  .wrap(yargs.terminalWidth())
  .strict()
  .updateStrings({
    'Commands:': headerTxt('Commands:'),
    'Options:': headerTxt('Options:'),
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
    // const requiredArgsWhenNotAll = {
    //   eu
    // }
    return true
  }, true)
  .option('v', {
    alias: 'verbose',
    global: true,
    type: 'boolean',
    coerce: coercer,
    conflicts: 'q'
  })
  .option('q', {
    alias: 'quiet',
    global: true,
    type: 'boolean',
    coerce: coercer,
    conflicts: 'v'
  })
  .demandCommand(1)

yargs.command(
  ['host:update [pids...]', 'hu'],
  'Update DB with info about hosts for provided projects',
  yargs => {
    yargs.positional('pids', {
      type: 'string',
      describe: 'List of project IDs'
    })
    yargs.option('a', {
      alias: 'all',
      description: 'Update all hosts from all projects',
      type: 'boolean',
      coerce: coercer,
      conflicts: ['pids']
    })
  },
  argv => {
    if (argv.all) {
      updateHostsUsingAllProjects()
    } else {
      argv.pids.forEach(pid => updateHost(pid))
    }
  }
)

yargs.command(
  ['host:sample', 'hs'],
  'Update DB with info about hosts using 1 proj per host sample',
  () => {},
  argv => updateHostsUsingSampleProjects()
)

yargs.command(
  ['host:project-match', 'hp'],
  'Update DB matching hosts and projects',
  () => {},
  argv => updateProjectHostRelationships()
)

yargs.command(
  ['project:update [pids]', 'pu'],
  'Update DB with info about provided projects',
  yargs => {
    yargs.positional('pids', {
      type: 'string',
      describe: 'List of project IDs',
      coerce: coercer
    })
    yargs.option('a', {
      alias: 'all',
      description: 'Update all projects',
      type: 'boolean',
      coerce: coercer,
      conflicts: ['pids']
    })
  },
  argv => {
    if (argv.all) {
      updateProjects()
    } else {
      argv.pids.forEach(pid => updateProject(pid))
    }
  }
)

yargs.command(
  ['env:update [pid] [env]', 'eu'],
  'Update DB with info about specific env',
  yargs => {
    yargs.positional('pid', {
      type: 'string',
      describe: 'The project ID'
    })
    yargs.positional('env', {
      type: 'string',
      describe: 'The environment ID',
      default: 'master'
    })
    yargs.option('a', {
      alias: 'all',
      description: 'Update all envs from all projects',
      type: 'boolean',
      coerce: coercer,
      conflicts: ['pid']
    })
  },
  argv => {
    if (argv.all) {
      updateAllCurrentProjectsEnvironmentsFromAPI()
    } else {
      updateEnvironment(argv.pid, argv.env)
    }
  }
)

yargs.command(
  ['env:delete-inactive', 'ed'],
  'Delete ALL inactive environments across ALL projects',
  () => {},
  argv => deleteInactiveEnvironments()
)

yargs.command(
  ['env:smoke-test [pid] [env]', 'es'],
  'Update DB with info about deployed app database',
  yargs => {
    yargs.positional('pid', {
      type: 'string',
      describe: 'The project ID'
    })
    yargs.positional('env', {
      type: 'string',
      describe: 'The environment ID',
      default: 'master'
    })
    yargs.option('a', {
      alias: 'all',
      description: 'Update all apps from all projects',
      type: 'boolean',
      coerce: coercer,
      conflicts: ['pid']
    })
  },
  argv => {
    if (argv.all) {
      smokeTestAllLiveApps()
    } else {
      smokeTestApp(argv.pid, argv.env)
    }
  }
)

yargs.command(
  ['activity:find-failures', 'af'],
  'Update envs in DB that failed to deploy',
  () => {},
  argv => searchActivitiesForFailures()
)

exports.yargs = yargs
