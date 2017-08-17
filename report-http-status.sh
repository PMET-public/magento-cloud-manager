#!/usr/bin/env bash

# stop on errors
# set -e
# turn on debugging
# set -x

source <(sed -n '/^[[:alnum:]_]*=[^\$()\`]*$/p'  ~/bin/cloud-status/.secrets)

results=$(grep -v ' 200 ' ~/cloud-status-reports/check-env-results.txt | grep -v ' 40[0-9] ')

if [ ! -z "$results" ]; then
  curl -s -X POST -H 'Content-type: application/json' --data "{\"text\":\"These envs are returning non 200 status codes:\n$results\"}" $SLACK_URL
fi
