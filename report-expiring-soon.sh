#!/usr/bin/env bash

# stop on errors
# set -e
# turn on debugging
# set -x

# import env vars from secrets file
source <(sed -n '/^[[:alnum:]_]*=[^\$()\`]*$/p'  ~/bin/cloud-status/.secrets)

deadline=$(date -d '20 days' +%Y-%m-%d)

results=""
while read line; do 
  if [[ "$deadline" > "$line"  ]]; then 
    results="${results}${line}
"; 
  fi; 
done <~/cloud-status-reports/check-env-results.txt

if [ ! -z "$results" ]; then 
  curl -s -X POST -H 'Content-type: application/json' --data "{\"text\":\"These envs are expiring in the next 20 days:\n$results\"}" $SLACK_URL
fi

