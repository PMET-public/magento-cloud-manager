const project = require('./app/project');
const environment = require('./app/environment');
const activity = require('./app/activity');
const application = require('./app/application-state');
const host = require('./app/host');

(async function () {
  let result;
  //result = await project.updateProjects();
  //result = await activity.searchActivitiesForFailures();
  //result = await environment.deleteInactiveEnvironments();
  //result = await environment.updateAllCurrentProjectsEnvironmentsFromAPI();
  //result = await application.updateAllApplicationsStates();
  //result = await host.updateHostsUsingAllProjects();
  result = await host.updateHostsUsingSampleProjects();
})();
