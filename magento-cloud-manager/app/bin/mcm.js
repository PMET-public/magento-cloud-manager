#!/usr/bin/env node
const commander = require('commander')
const colors = require('colors')

commander.version('0.1.0')
  .action(function (cmd) {
    commander.outputHelp(txt => txt.replace(/(\r?\n)\r?\n/g,'$1'))
    console.error(`\nCommand: ${colors.red(cmd)} not recognized!`)
    process.exit(1);
  })

commander
  .command('test [env]')
  .description('this is test1')
  .action(() => console.log('test called'))

commander
  .command('test2 [env]')
  .description('this is test2')
  .action(() => console.log('test2 called'))

commander.parse(process.argv)


if (!process.argv.slice(2).length) {
  commander.outputHelp();
}
