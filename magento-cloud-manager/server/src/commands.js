const {db, logger} = require('../util/common')
const archiver = require('archiver')
const chalk = require('chalk')

module.exports = (req, res) => {

  // http://localhost:3001/commands?p=r7lyqt4tsnw6g&e=master
  
  const proj = req.query.p
  const env = req.query.e
  if (!proj || !env) {
    return
  }
  
  const zip = archiver('zip')
  const result = db
  .prepare(
    `SELECT p.title project_title, e.title environment_title, 
    project_url, region, machine_name
    FROM environments e LEFT JOIN projects p ON e.project_id = p.id
    WHERE e.project_id = ? and e.id = ?`
  )
  .get(proj, env)

  const getCommands = () => {
    const MC_CLI = '~/.magento-cloud/bin/magento-cloud'
    const ENV_OPT = `-p ${proj} -e ${env}`
    const SSH = `${MC_CLI} ssh ${ENV_OPT}`
    const M_CLI = 'php bin/magento'

    return [
      {
        name: '1-install-magento-cloud-cli',
        description: 'This will install the magento-cloud tool. You only need to run this once.',
        command: 'curl -sS https://accounts.magento.cloud/cli/installer | php',
      },
      {
        name: '2-setup-ssh-key',
        description: '',
        command: '',
      },
      {
        name: 'DELETE',
        description: `${chalk.redBright('THIS WILL PERMANENTLY DELETE THIS ENV.')}`,
        command: `${MC_CLI} environment:delete ${ENV_OPT} --no-wait`,
      },
      {
        name: 'ssh',
        description: `${chalk.bgBlack.greenBright.bold('Starting an ssh session ...')}`,
        command: SSH,
      },
      {
        name: 'cron',
        description: `${chalk.bgBlack.greenBright.bold('Run cron jobs immediately')}`,
        command: 'php bin/magento cron:run',
      },
      {
        name: 'reindex',
        description: '',
        command: 'php bin/magento index:reindex',
      }
    ]
  }

  const storeUrl = `https://${result['machine_name']}-${proj}.${result['region']}.magentosite.cloud`

  const getUrls = () => {
    return [
      {
        name: 'cloud-ui',
        url: `${result['project_url']}`
      },
      {
        name: 'storefront',
        url: `${storeUrl}`
      },
      {
        name: 'admin',
        url: `${storeUrl}/admin/`
      },
      {
        name: 'support-request',
        url: 'https://support.magento.com/hc/en-us/requests'
      }
    ]
  }

  res.attachment(`${result['project_title']}-${result['environment_title']}.zip`)
  zip.on('error', function(err) {
    res.status(500).send({error: err.message})
  })
  zip.pipe(res)

  getCommands().forEach(({name, description, command}) => {
    const str = `#!/usr/bin/env bash
    echo -e ${description}
    ${command}`
    zip.append(str, {name: `${name}.command`, mode: 0744})
  })

  getUrls().forEach(({name, url}) => {
    const str = `[InternetShortcut]\nURL=${url}\nIconIndex=0`
    zip.append(str, {name: `_${name}.url`, mode: 0444})
  })

  zip.finalize()
}
