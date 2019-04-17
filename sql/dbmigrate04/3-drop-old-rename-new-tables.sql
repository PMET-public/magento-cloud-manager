DROP TABLE projects; ALTER TABLE projects_new RENAME TO projects;
DROP TABLE hosts_states; ALTER TABLE hosts_states_new RENAME TO hosts_states;
DROP TABLE users; ALTER TABLE users_new RENAME TO users;
DROP TABLE environments; ALTER TABLE environments_new RENAME TO environments;
DROP TABLE cert_expirations; ALTER TABLE cert_expirations_new RENAME TO cert_expirations;
DROP TABLE matched_envs_hosts; ALTER TABLE matched_envs_hosts_new RENAME TO matched_envs_hosts;
DROP TABLE smoke_tests; ALTER TABLE smoke_tests_new RENAME TO smoke_tests;
