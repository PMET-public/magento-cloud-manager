const {db} = require('../util/common')

// useful snippet to get db column names to return
// perl -ne 's/^\s+`(.*)`.*/\1/ and print "$myvar.$1,\n"; /CREATE[^"]*"(..)/ and $myvar=$1' cloud.sql

module.exports = (req, res) => {
  const sql = `SELECT 
      s.id, a.app_yaml_md5, a.ee_composer_version, a.composer_lock_md5, a.config_php_md5,
      s.cumulative_cpu_percent, s.not_valid_index_count, s.catalog_product_entity_count,
      s.catalog_category_product_count, s.admin_user_count, s.store_count, s.order_count, s.cms_block_count,
      s.http_status, s.store_url_uncached,
      s.store_url_cached, s.cat_url, s.cat_url_product_count, s.cat_url_uncached, s.cat_url_partial_cache,
      s.cat_url_cached, s.search_url, s.search_url_partial_cache, s.search_url_product_count,
      s.german_check, s.venia_check, s.admin_check, s.last_cron_success, s.error_logs, s.last_deploy_log, s.cpus, 
      s.utilization_start || ',' || s.utilization_end utilization_start_end, s.timestamp,
      e.project_id, e.id environment_id, e.title environment_title, e.branch_level, machine_name, last_created_at,
      e.project_id || '-' || e.id project_environment_id,
      case
        when s.last_login_customer < last_created_at then null
        else s.last_login_customer
      end as last_login_customer,
      case
        when s.last_login_admin < last_created_at then null
        else s.last_login_admin
      end as last_login_admin,
      case 
        when e.missing = 1 then 'missing'
        when e.failure = 1 then 'failure'
        when e.active = 1 then 'active'
        when e.active = 0 then 'inactive'
        else 'invalid'
      end as env_status,
      p.region, p.title project_title, p.user_list, 
      case 
        when p.active = 1 then 'active' 
        else 'missing' 
      end as proj_status, 
      c.host_name, c.expiration
    FROM environments e
    LEFT JOIN 
      (SELECT * from smoke_tests GROUP BY project_id, environment_id ORDER BY id DESC) AS s
      ON e.id = s.environment_id and e.project_id = s.project_id
    LEFT JOIN
      (SELECT p.id, p.title, p.region, p.active, user_list FROM projects p
        LEFT JOIN  (SELECT project_id, group_concat(email || ':' || role) user_list FROM users GROUP BY project_id) u
        ON u.project_id = p.id) p
    ON e.project_id = p.id
    LEFT JOIN cert_expirations c ON c.host_name = e.machine_name || '-' || e.project_id || '.' || p.region || '.magentosite.cloud'
    LEFT JOIN applications a ON e.id = a.environment_id and e.project_id = a.project_id
    ORDER BY last_created_at DESC`
  const rows = db.prepare(sql).all()
  res.json(rows)
}
