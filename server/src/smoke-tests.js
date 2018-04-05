const {db} = require('../util/common')

// useful snippet to get db column names to return
// perl -ne 's/^\s+`(.*)`.*/\1/ and print "$myvar.$1,\n"; /CREATE[^"]*"(..)/ and $myvar=$1' cloud.sql

module.exports = (req, res) => {
/*
  const sql = `SELECT
  sm.id, sm.project_id, sm.environment_id, sm.app_yaml_md5, sm.ee_composer_version, sm.composer_lock_md5, 
  sm.composer_lock_mtime, sm.cumulative_cpu_percent, sm.not_valid_index_count, sm.catalog_product_entity_count, 
  sm.catalog_category_product_count, sm.admin_user_count, sm.store_count, sm.order_count, sm.cms_block_count, 
  sm.template_count, sm.last_login_customer, sm.last_login_admin, sm.http_status, sm.store_url_uncached, sm.store_url_cached, 
  sm.cat_url, sm.cat_url_product_count, sm.cat_url_uncached, sm.cat_url_partial_cache, sm.cat_url_cached, sm.german_check, 
  sm.venia_check, sm.admin_check, sm.error_logs, sm.utilization_start, sm.utilization_end, sm.timestamp,
  pr.region, pr.title project_title, pr.user_list,
  en.id environment_id, en.title environment_title, en.machine_name, 
  case when missing = 1 then 'missing' when failure = 1 then 'failure' else 'active' end as status,
  ce.host_name, ce.expiration
FROM 
      (SELECT * from smoke_tests GROUP BY project_id, environment_id ORDER BY id DESC) AS sm
LEFT JOIN
	(SELECT p.*, user_list FROM projects p
		LEFT JOIN  (SELECT project_id, group_concat(email || ':' || role) user_list FROM users GROUP BY project_id) u
		ON u.project_id = p.id) pr
ON sm.project_id = pr.id
LEFT JOIN environments en ON sm.environment_id = en.id AND sm.project_id = en.project_id 
LEFT JOIN cert_expirations ce ON ce.host_name = en.machine_name || '-' || sm.project_id || '.' || pr.region || '.magentosite.cloud'`
*/
  const sql = `SELECT 
    s.id, s.app_yaml_md5, s.ee_composer_version, s.composer_lock_md5,
    s.composer_lock_mtime, s.cumulative_cpu_percent, s.not_valid_index_count, s.catalog_product_entity_count,
    s.catalog_category_product_count, s.admin_user_count, s.store_count, s.order_count, s.cms_block_count,
    s.template_count, s.last_login_customer, s.last_login_admin, s.http_status, s.store_url_uncached,
    s.store_url_cached, s.cat_url, s.cat_url_product_count, s.cat_url_uncached, s.cat_url_partial_cache,
    s.cat_url_cached, s.german_check, s.venia_check, s.admin_check, s.error_logs, s.cpus, s.utilization_start,
    s.utilization_end, s.timestamp,
    e.project_id, e.id environment_id, e.title environment_title, machine_name, last_created_at,
    case when missing = 1 then 'missing' when failure = 1 then 'failure' else 'active' end as status,
    p.region, p.title project_title, p.user_list,
    c.host_name, c.expiration
  FROM environments e
  LEFT JOIN 
    (SELECT * from smoke_tests GROUP BY project_id, environment_id ORDER BY id DESC) AS s
    ON e.id = s.environment_id and e.project_id = s.project_id
  LEFT JOIN
    (SELECT p.*, user_list FROM projects p
      LEFT JOIN  (SELECT project_id, group_concat(email || ':' || role) user_list FROM users GROUP BY project_id) u
      ON u.project_id = p.id) p
  ON e.project_id = p.id
  LEFT JOIN cert_expirations c ON c.host_name = e.machine_name || '-' || e.project_id || '.' || p.region || '.magentosite.cloud'
  ORDER BY last_created_at DESC`
  const rows = db.prepare(sql).all()
  res.json(rows)
}
