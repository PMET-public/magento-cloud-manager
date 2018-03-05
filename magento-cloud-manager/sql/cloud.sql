BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS `projects` (
	`id`	TEXT NOT NULL,
	`title`	TEXT NOT NULL,
	`region`	TEXT NOT NULL,
	`project_url`	TEXT NOT NULL,
	`git_url`	TEXT NOT NULL,
	`created_at`	INTEGER NOT NULL,
	`plan_size`	TEXT NOT NULL,
	`allowed_environments`	INTEGER NOT NULL,
	`storage`	INTEGER NOT NULL,
	`user_licenses`	INTEGER NOT NULL,
	`active`	BOOLEAN NOT NULL CHECK(active IN ( 0 , 1 )),
	`client_ssh_key`	TEXT NOT NULL,
	`timestamp`	DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `project_hosts` (
	`id`	INTEGER NOT NULL,
	`project_id`	TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS `performance_tests` (
	`id`	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	`project_id`	TEXT NOT NULL,
	`environment_id`	TEXT NOT NULL,
	`cmd`	TEXT NOT NULL,
	`output`	TEXT NOT NULL,
	`real_time_in_sec`	REAL NOT NULL,
	`user_time_in_sec`	REAL NOT NULL,
	`sys_time_in_sec`	REAL NOT NULL,
	`successful_test`	BOOLEAN NOT NULL,
	`timestamp`	DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS `hosts_states` (
	`id`	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	`project_id`	TEXT NOT NULL,
	`environment_id`	TEXT NOT NULL,
	`boot_time`	INTEGER NOT NULL,
	`total_memory`	INTEGER NOT NULL,
	`cpus`	INTEGER NOT NULL,
	`load_avg_1`	REAL NOT NULL,
	`load_avg_5`	REAL NOT NULL,
	`load_avg_15`	REAL NOT NULL,
	`ip`	TEXT NOT NULL,
	`running_processes`	INTEGER NOT NULL,
	`total_processes`	INTEGER NOT NULL,
	`last_process_id`	INTEGER NOT NULL,
	`timestamp`	DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS `environments` (
	`id`	TEXT NOT NULL,
	`project_id`	TEXT NOT NULL,
	`title`	TEXT NOT NULL,
	`machine_name`	TEXT,
	`active`	BOOLEAN NOT NULL CHECK(active IN ( 0 , 1 )),
	`failure`	BOOLEAN CHECK(failure in ( 0 , 1 )),
	`missing`	BOOLEAN CHECK(missing in ( 0 , 1 )),
	`created_at`	INTEGER NOT NULL,
	`timestamp`	DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(`id`,`project_id`,`created_at`)
);
CREATE TABLE IF NOT EXISTS `applications_states` (
	`id`	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	`project_id`	TEXT NOT NULL,
	`environment_id`	TEXT NOT NULL,
	`ee_composer_version`	TEXT NOT NULL,
	`composer_lock_md5`	TEXT NOT NULL,
	`composer_lock_mtime`	INTEGER NOT NULL,
	`timestamp`	DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMIT;
