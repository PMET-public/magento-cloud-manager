#!/usr/bin/env node
const commander = require('commander')
const colors = require('colors')
const {logger} = require('../src/common')
const {updateHost, updateHostsUsingAllProject, updateProjectHostRelationships} = require('../src/host')
const {updateProject, updateProjects} = require('../src/project')
const {deleteInactiveEnvironments} = require('../src/environment')
const {updateApplicationState, updateAllApplicationsStates} = require('../src/application-state')

const removeExtraLines = txt => txt.replace(/(\r?\n)\r?\n/g, '$1')

function help() {
  commander.outputHelp(removeExtraLines)
}

function enableVerbose() {
  logger.remove(logger.simpleConsole).add(logger.verboseConsole)
}

commander
  .version('0.1.0')
  .option('-v, --verbose', 'Show debugging information')
  .action(function(cmd) {
    help()
    console.error(`\nCommand: ${colors.red(cmd)} not recognized.`)
    process.exit(1)
  })

commander
  .command('host:update [pids...]')
  .description('Update DB with info about hosts for provided projects')
  .option('-a, --all', 'Use all projects to update hosts\' info')
  .action((args, options) => {
    if (commander.verbose) enableVerbose()
    if (options.all) {
      updateHostsUsingAllProject()
    } else {
      args.forEach(pid => updateHost(pid))
    }
  })

commander
  .command('project:update [pids...]')
  .description('Update DB with info about provided projects')
  .option('-a, --all', 'All projects')
  .action((args, options) => {
    if (commander.verbose) enableVerbose()
    if (options.all) {
      updateProjects();
    } else {
      args.forEach(pid => updateProject(pid))
    }
  })

commander
  .command('environments:delete-inactive')
  .description('Delete ALL inactive environments across ALL projects')
  .action((args, options) => {
    if (commander.verbose) enableVerbose()
    deleteInactiveEnvironments()
  })

commander
  .command('app:update')
  .description('Update DB with info about deployed app')
  .option('-a, --all', 'Every app (env) of every project')
  .option('-p, --project <pid>', 'App\'s project')
  .option('-e, --env <env_id>', 'App\'s env')
  .action((args, options) => {
    if (commander.verbose) enableVerbose()
    if (typeof options.all !== 'undefined') {
      updateAllApplicationsStates();
    }
    if (!(options.project && options.env)) {
      help()
      console.error(`\n${colors.red('Project and env')} are required.`)
      process.exit(1)
    }
  })



commander.parse(process.argv)

if (!process.argv.slice(2).length) {
  help()
}
