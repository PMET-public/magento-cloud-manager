const archiver = require('archiver')
const chalk = require('chalk')

module.exports = (req, res) => {
  const commands = [
    {
      name: '1-install-magento-cloud-cli',
      description: 'This will install the magento-cloud tool. You only need to run this once.',
      command: 'curl -sS https://accounts.magento.cloud/cli/installer | php',
      type: 'local'
    },
    {
      name: '2-setup-ssh-key',
      description: '',
      command: '',
      type: 'local'
    },
    {
      name: 'ssh',
      description: 'Starting an ssh session',
      command: '',
      type: 'ssh'
    },
    {
      name: 'cron',
      description: 'Run cron jobs immediately',
      command: 'php bin/magento cron:run',
      type: 'ssh'
    },
    {
      name: 'reindex',
      command: 'php bin/magento index:reindex',
      type: 'ssh'
    }
  ]

  const zip = archiver('zip')
  const MC_CLI = '~/.magento-cloud/bin/magento-cloud'
  const proj = 'hniuz2woty5y6'
  const env = 'master'
  const sshTemplate = `${MC_CLI} ssh -p ${proj} -e ${env}`

  res.attachment(`${proj}-${env}.zip`)
  zip.on('error', function(err) {
    res.status(500).send({error: err.message})
  })

  // Send the file to the page output.
  zip.pipe(res)

  // Create zip with some files. Two dynamic, one static. Put #2 in a sub folder.
  commands.forEach(({name, description, command, type}) => {
    const str = `#!/usr/bin/env bash
    echo -e ${chalk.greenBright(description)}
    ${type === 'ssh' ? sshTemplate : ''} ${command}`
    zip.append(str, {name: `${name}.command`, mode: 0744})
  })
  zip.finalize()
}
