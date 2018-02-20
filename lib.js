const project = require('./magento-cloud-manager/project');
const environment = require('./magento-cloud-manager/environment');
const activity = require('./magento-cloud-manager/activity');
const application = require('./magento-cloud-manager/application');
const host = require('./magento-cloud-manager/host');

(async function () {
  let result;
  //result = await project.updateProjects();
  //result = await activity.searchActivitiesForFailures();
  //result = await environment.deleteInactiveEnvironments();
  //result = await environment.updateAllCurrentProjectsEnvironmentsFromAPI();
  //result = await application.updateAllApplicationsStates();
  result = await host.updateHostsUsingAllProjects();
  //result = await host.updateHostsUsingSampleProjects();
})();
