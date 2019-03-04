#!/bin/bash


# debug
set -x

# stop on errors
set -e

MCM_DIR=$( cd $(dirname $0)/.. ; pwd -P )

cp "${MCM_DIR}/cron/monitoring-results-latest" "${MCM_DIR}/cron/monitoring-results-old" || :
"${MCM_DIR}/cli/bin/mcm" env:check-public-url --quiet --all -t 0 > "${MCM_DIR}/cron/monitoring-results-latest"
diff "${MCM_DIR}/cron/monitoring-results-latest" "${MCM_DIR}/cron/monitoring-results-old"

curl -X POST -H 'Content-type: application/json' --data '{"text":"@here test by khb"}' https://hooks.slack.com/services/T02V4A29Q/B6MH2KZK4/T5T
Bz2RBhhZRTiAMCnoonFdz

