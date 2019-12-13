#!/bin/bash

if [[ -z "$debug" || debug -eq 1 ]]; then
  set -x
  set -e
fi

# make it easy to call via bash history or while writing/debugging
[[ "$0" =~ "most-recent" ]] || rm /tmp/most-recent-drr.sh || ln -s $0 /tmp/most-recent-drr.sh

red='\033[0;31m'
green='\033[0;32m'
yellow='\033[1;33m'
no_color='\033[0m'
cur_unix_ts=$(date +%s)
is_cloud=$(test ! -z "$MAGENTO_CLOUD_ROUTES" && echo "true" || echo "false")

report () {
  printf "${@}" | tee -a /tmp/$cur_unix_ts-report.log
}

get_ee_version() {
  perl -ne 'undef $/; s/[\S\s]*(cloud-metapackage|magento\/product-enterprise-edition)"[\S\s]*?"version": "([^"]*)[\S\s]*/\2/m and print'
}

get_http_response_code() {
  perl -ne 's/^HTTP\/[1-2]\.?1? ([0-9]*).*/\1/ and print'
}

is_cron_enabled() {
  env_php_file=$1 php -r 'error_reporting(E_ERROR|E_WARNING|E_PARSE);$arr=include "$_SERVER[env_php_file]";echo !array_key_exists("enabled", $arr["cron"]) || $arr["cron"]["enabled"] == 1  ? "true" : "false";'
}

app_dir=$(
  test -f /app/composer.json && echo '/app' ||
  { 
    test -f /var/www/magento/composer.json && 
    echo '/var/www/magento' 
  } ||
  exit 'Magento dir not found.'
)

# check Magento version
this_ee_composer_version=$(cat $app_dir/composer.lock | get_ee_version)
public_ee_composer_version=$(curl -s https://raw.githubusercontent.com/magento/magento-cloud/master/composer.lock | get_ee_version)
test $this_ee_composer_version = $public_ee_composer_version &&
  report "This env is running the lastest public Magento version:$green $public_ee_composer_version.$no_color\n" ||
  report "This env is not running the lastest public Magento version.$yellow env: $this_ee_composer_version, public: $public_ee_composer_version.$no_color\n"

# check for unfinished maintenance 
cd $app_dir/var
test -f .maintenance.flag &&
  report "$red.maintenance.flag found. Removing ...$no_color\n" &&
  rm .maintenance.flag ||
  report 'No maintenance flag found.\n'

# check for failed deploy
test -f .deploy_is_failed &&
  report "$red.deploy_is_failed found. Removing ...$no_color\n" &&
  rm .deploy_is_failed &&
  report "Attempting 'php bin/magento setup:upgrade'\n" &&
  {
    cd ${app_dir}
    php bin/magento setup:upgrade >/dev/null 2>&1;
    report 'Tailing relevant end of install_upgrade.log:\n' && \
    cat ${app_dir}/var/log/install_upgrade.log | \
    perl -pe 's/\e\[\d+(?>(;\d+)*)m//g;' | \
    grep -v '^Module ' | \
    grep -v '^Running schema' | \
    perl -pe 's/^/\t/' | \
    tail
  } ||
  report 'No failed deploy flag found.\n'

# check for unusual HTTP responses
store_url=$(php $app_dir/bin/magento config:show:default-url)
localhost_http_status=$(curl -sI localhost | get_http_response_code)
test $localhost_http_status -ne 302 &&
  report "Localhost HTTP response should be 302 is $red$localhost_http_status$no_color\n" ||
  report 'Localhost HTTP response is normal (302)\n'
curl -I $store_url 2>&1 | grep -q 'certificate problem' && 
  report "${red}Certificate problem.$no_color\n"
remote_public_http_status=$(curl -skI $store_url | get_http_response_code)
test $remote_public_http_status -eq 200 &&
  report 'Public HTTP response is normal ($remote_public_http_status)\n' ||
  report "Public HTTP response should be 200 is $red$remote_public_http_status$no_color\n"
route_url=$(echo "$MAGENTO_CLOUD_ROUTES" | base64 -d - | perl -pe 's#^{"(https?://[^"]+).*#\1#')
test "$is_cloud" = "true" &&
  # only compare string after https?://
  test "$(echo $store_url | perl -pe 's#https?://##')" = "$(echo $route_url | perl -pe 's#https?://##')" ||
    report "${red}Route url ($route_url) is different than configured store url ($store_url)$no_color\n"

# check cron
cd $app_dir
env_file_old=$app_dir/app/etc/env.php
env_file_new=/tmp/env.php.$cur_unix_ts
test $(is_cron_enabled $env_file_old) = "true" ||
  { 
    report "${red}Cron disabled.$no_color Attempting fix ... " &&
      cp $env_file_old $env_file_new &&
      perl -i -p00e "s/'enabled'\s*=>\s*0/'enabled' => 1/" $env_file_new &&
      test "$(is_cron_enabled $env_file_new)" = "true" &&
      { 
        mv $env_file_new $env_file_old
        report "cron $green fixed.$no_color Running cron ...\n"
        php bin/magento cron:run > /dev/null
      } ||
      exit "Enabling cron via regex failed."
  }
last_cron=$(grep -A2 '^\[.*Launching command' /var/log/cron.log | tail -3 | tr '\n' ' ')
last_cron_ts=$(date -d "$(echo $last_cron | perl -pe 's/^.([^\.]+).*$/\1/')" +%s)
min_since_last_cron=$(( (cur_unix_ts - last_cron_ts) / 60 ))
report 'Last cron'
echo $last_cron | grep -q 'Ran jobs by' &&
  report "$green succeeded " ||
  report "$red failed "
test $min_since_last_cron -lt 10 &&
  report "$green"
report "$min_since_last_cron$no_color minutes ago.\n"

# check load avg
read -r nproc loadavg1 loadavg5 < <(echo $(nproc) $(awk "{print \$1, \$2}" /proc/loadavg))
load1=$(awk "BEGIN {printf \"%.f\", $loadavg1 * 100 / $nproc}")
load5=$(awk "BEGIN {printf \"%.f\", $loadavg5 * 100 / $nproc}")
test $load1 -gt 99 && 
  color="$red" || 
  {
    test $load1 -gt 89 && 
      color="$yellow" || 
      color="$green"
  }
report "The past 1 min load for this host: $color$load1%%$no_color\n"
report "The past 5 min load for this host: $color$load5%%$no_color\n"
report "Host has $nproc cpus.\n"

mysql main -sN -h database.internal -e "
  SELECT \"not_valid_index_count\", COUNT(*) FROM indexer_state WHERE status != \"valid\";
  SELECT \"catalog_product_entity_count\", COUNT(*) FROM catalog_product_entity;
  SELECT \"catalog_category_product_count\", COUNT(*) FROM catalog_category_product;
  SELECT \"admin_user_count\", COUNT(*) FROM admin_user;
  SELECT \"store_count\", COUNT(*) FROM store;
  SELECT \"order_count\", COUNT(*) FROM sales_order;
  SELECT \"cms_block_count\", COUNT(*) FROM cms_block;
  SELECT \"last_login_customer\", UNIX_TIMESTAMP(last_login_at) FROM customer_log 
    ORDER BY last_login_at DESC limit 1;
  SELECT \"last_login_admin\", UNIX_TIMESTAMP(logdate) FROM admin_user WHERE username != \"${magentoSIAdminUser}\"
    ORDER BY logdate DESC limit 1;
"

# last admin login

# last customer login

# last http access (not curl UA)

# check indexes


# check services
