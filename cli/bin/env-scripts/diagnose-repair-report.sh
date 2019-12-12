#!/bin/bash

set -x
set -e

red='\033[0;31m'
green='\033[0;32m'
yellow='\033[1;33m'
no_color='\033[0m'
cur_unix_ts=$(date +%s)
report=/tmp/report-$cur_unix_ts.log
app_dir=$(test -f /app/composer.json && echo '/app' || \
  { test -f /var/www/magento/composer.json && echo '/var/www/magento'; } || \
  exit 'Magento dir not found.')

# check Magento version
get_ee_version() {
  perl -ne 'undef $/; s/[\S\s]*(cloud-metapackage|magento\/product-enterprise-edition)"[\S\s]*?"version": "([^"]*)[\S\s]*/\2/m and print'
}
this_ee_composer_version=$(cat $app_dir/composer.lock | get_ee_version)
public_ee_composer_version=$(curl -s https://raw.githubusercontent.com/magento/magento-cloud/master/composer.lock | get_ee_version)

test $this_ee_composer_version = $public_ee_composer_version &&
  printf "This env is running the lastest public Magento version:$green $public_ee_composer_version.$no_color\n" ||
  printf "This env is not running the lastest public Magento version.$yellow env: $this_ee_composer_version, public: $public_ee_composer_version.$no_color\n"

# check for unfinished maintenance 
cd $app_dir/var;
test -f .maintenance.flag && \
  printf "$red.maintenance.flag found. Removing ...$no_color\n" && \
  rm .maintenance.flag || \
  echo 'No maintenance flag found.'

# check for failed deploy
test -f .deploy_is_failed && \
  printf "$red.deploy_is_failed found. Removing ...$no_color\n" && \
  rm .deploy_is_failed && \
  echo 'Attempting \"php bin/magento setup:upgrade\"' && \
  { 
    cd ${app_dir};
    php bin/magento setup:upgrade >/dev/null 2>&1;
    echo 'Tailing relevant end of install_upgrade.log:' && \
    cat ${app_dir}/var/log/install_upgrade.log | \
    perl -pe 's/\e\[\d+(?>(;\d+)*)m//g;' | \
    grep -v '^Module ' | \
    grep -v '^Running schema' | \
    perl -pe 's/^/\t/' | \
    tail;
  } || \
  echo 'No failed deploy flag found.'

# check for unusual HTTP responses
get_http_response_code() {
  perl -ne 's/^HTTP\/1.1 ([0-9]*).*/\1/ and print'
}
store_url=$(php $app_dir/bin/magento config:show:default-url)
localhost_http_status=$(curl -sI localhost | get_http_response_code)
test $localhost_http_status -ne 302 && \
  printf "localhost HTTP response should be 302 is $red$localhost_http_status$no_color\n" || \
  echo 'localhost HTTP is normal (302)'
remote_public_http_status=$(curl -sI $store_url | get_http_response_code)
echo Remote public HTTP response is

# check cron
last_cron=$(grep -A2 '^\[.*Launching command' /var/log/cron.log | tail -3 | tr '\n' ' ')
last_cron_ts=$(date -d "$(echo $last_cron | perl -pe 's/^.([^\.]+).*$/\1/')" +%s)
min_since_last_cron=$(( (cur_unix_ts - last_cron_ts) / 60 ))
printf 'Last cron'
echo $last_cron | grep -s 'Ran jobs by' && printf "$green succeeded" || printf "$red failed"
test $min_since_last_cron -lt 10 && printf "$green $min_since_last_cron"
printf "$no_color minutes ago.\n"

# check admin login

# check db

# check indexes

# check magento version

# check services

# check disk space



exit


# check load avg

msg Checking load on env ... | tee -a $report

read -r nproc loadavg1 loadavg5 < <($ssh_cmd 'echo $(nproc) $(awk "{print \$1, \$2}" /proc/loadavg)' 2> /dev/null)

load1=$(awk "BEGIN {printf "%.f", $loadavg1 * 100 / $nproc}")
load5=$(awk "BEGIN {printf "%.f", $loadavg5 * 100 / $nproc}")

[[ $load1 -gt 99 ]] && color="$red" || [[ $load1 -gt 89 ]] && color="$yellow" || color="$green"
printf "The past 1 min load for this host: $color$load1%%$no_color\n" | tee -a $report
printf "The past 5 min load for this host: $color$load5%%$no_color\n" | tee -a $report
echo "Just a reminder: host =/= env. A env may be limited even if resources are available on its host."


# copy report to clipboard and strip color characters
cat $report | perl -pe 's/\e\[\d+(?>(;\d+)*)m//g;' | pbcopy

