#!/bin/bash

MCM_DIR="$( cd $(dirname $0)/.. ; pwd -P )"

slack_url=$(perl -nle '/slackUrl.*:\s*"(.*)"/ and print $1' "${MCM_DIR}/cli/.secrets.json")
old_log_file="${MCM_DIR}/cron/monitoring-results.prev.log"
new_log_file="${MCM_DIR}/cron/monitoring-results.log"

cp "${new_log_file}" "${old_log_file}" || touch "${old_log_file}"
# filter empty lines and some stderr output that begins w/ space chars
"${MCM_DIR}/cli/bin/mcm" env:check-web-status --quiet --all -t 0 | perl -ne '/^\S/ and print' | sort | tee /dev/tty > "${new_log_file}"
resolved_errors=$(diff "${old_log_file}" "${new_log_file}" | perl -ne 's/^</?/ and print')
new_errors=$(diff "${old_log_file}" "${new_log_file}" | perl -ne 's/^>/!/ and print')

if [[ ! -z "${resolved_errors}" ]]; then
  error_count=$(echo "${resolved_errors}" | wc -l | xargs)
  msg=$(echo -e "\n${error_count} errors have been resolved (or have a different response).\n${resolved_errors}")
fi

if [[ ! -z "${new_errors}" ]]; then
  error_count=$(echo "${new_errors}" | wc -l | xargs)
  msg=$(echo -e "${msg}\n\n${error_count} new errors.\n${new_errors}")
fi

if [[ ! -z "${msg}" ]]; then
  echo "$msg"
  curl -X POST -H 'Content-type: application/json' --data "{\"text\":\"@here ${msg}\"}" "${slack_url}"
fi

