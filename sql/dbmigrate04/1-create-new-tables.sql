CREATE TABLE IF NOT EXISTS "projects_new" (
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
	`timestamp`	DATETIME NOT NULL DEFAULT (cast(strftime('%s','now') as int)),
	PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS "hosts_states_new" (
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
	`timestamp`	DATETIME NOT NULL DEFAULT (cast(strftime('%s','now') as int))
);
CREATE TABLE IF NOT EXISTS "users_new" (
	`project_id`	TEXT NOT NULL,
	`email`	TEXT NOT NULL,
	`role`	TEXT NOT NULL,
	`timestamp`	DATETIME NOT NULL DEFAULT (cast(strftime('%s','now') as int))
);
CREATE TABLE IF NOT EXISTS "environments_new" (
	`id`	TEXT NOT NULL,
	`title`	TEXT NOT NULL,
	`project_id`	TEXT NOT NULL,
	`machine_name`	TEXT,
	`active`	BOOLEAN NOT NULL CHECK(active IN ( 0 , 1 )),
	`failure`	BOOLEAN CHECK(failure in ( 0 , 1 )),
	`missing`	BOOLEAN CHECK(missing in ( 0 , 1 )),
	`last_created_at`	INTEGER NOT NULL,
	`branch_level`		INTEGER,
	`timestamp`	DATETIME NOT NULL DEFAULT (cast(strftime('%s','now') as int)),
	PRIMARY KEY(`id`,`project_id`)
);
CREATE TABLE IF NOT EXISTS "cert_expirations_new" (
	`host_name`	TEXT NOT NULL,
	`expiration`	INTEGER NOT NULL,
	`timestamp`	INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as int)),
	PRIMARY KEY(`host_name`)
);
CREATE TABLE IF NOT EXISTS "matched_envs_hosts_new" (
	`proj_env_id`	TEXT NOT NULL,
	`host_id`	INTEGER NOT NULL,
	PRIMARY KEY(`proj_env_id`)
);
CREATE TABLE IF NOT EXISTS "smoke_tests_new" (
	`id`	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	`project_id`	TEXT NOT NULL,
	`environment_id`	TEXT NOT NULL,
	`cumulative_cpu_percent`	REAL NOT NULL,
	`not_valid_index_count`	INTEGER,
	`catalog_product_entity_count`	INTEGER,
	`catalog_category_product_count`	INTEGER,
	`admin_user_count`	INTEGER,
	`store_count`	INTEGER,
	`order_count`	INTEGER,
	`cms_block_count`	INTEGER,
	`last_login_customer`	INTEGER,
	`last_login_admin`	INTEGER,
	`last_cron_success`	INTEGER,
	`http_status`	INTEGER NOT NULL,
	`store_url_uncached`	INTEGER,
	`store_url_cached`	INTEGER,
	`cat_url`	TEXT,
	`cat_url_product_count`	INTEGER,
	`cat_url_uncached`	INTEGER,
	`cat_url_partial_cache`	INTEGER,
	`cat_url_cached`	INTEGER,
	`search_url`	TEXT,
	`search_url_partial_cache`	INTEGER,
	`search_url_product_count`	INTEGER,
	`german_check`	BOOLEAN CHECK(german_check in ( 0 , 1 )),
	`venia_check`	BOOLEAN CHECK(venia_check in ( 0 , 1 )),
	`admin_check`	BOOLEAN CHECK(admin_check in ( 0 , 1 )),
	`last_deploy_log`	TEXT,
	`error_logs`	TEXT,
	`cpus` INTEGER,
	`utilization_start`	TEXT NOT NULL,
	`utilization_end`	TEXT,
	`timestamp`	DATETIME NOT NULL DEFAULT (cast(strftime('%s','now') as int))
);
CREATE TABLE IF NOT EXISTS "applications" (
	`project_id`	TEXT NOT NULL,
	`environment_id`	TEXT NOT NULL,
	`app_yaml_md5`	TEXT NOT NULL,
	`ee_composer_version`	TEXT,
	`composer_lock_md5`	TEXT,
	`composer_lock_mtime`	INTEGER NOT NULL,
	`config_php_md5`	TEXT,
	`timestamp`	DATETIME NOT NULL DEFAULT (cast(strftime('%s','now') as int)),
	PRIMARY KEY(`project_id`, `environment_id`)
);
