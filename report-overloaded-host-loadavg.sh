#!/usr/bin/env bash

# stop on errors
# set -e
# turn on debugging
# set -x

source <(sed -n '/^[[:alnum:]_]*=[^\$()\`]*$/p'  ~/bin/cloud-status/.secrets)

LOG_FILE="~/cloud-status-reports/overloaded.log"
DIR=$( cd $(dirname $0) ; pwd -P )

results=""
# for the 1st proj on each host, ssh in and find the 15 min loadavg and # of processors
for proj in $(grep '^1 ' ~/cloud-status-reports/projs-grouped-by-host.txt | awk '{print $4}'); do
  read nproc loadavg <<<$(~/.magento-cloud/bin/magento-cloud ssh -i "${DIR}/id_rsa.magento" -p $proj -e master 'echo -n "$(nproc) "; uptime' | awk '{printf "%.0f %.0f\n", $1, $NF}')
  cpu_multiple=$(echo "$nproc * 2.0" | bc -l | awk '{printf "%.0f", $1}')
  if [ "$cpu_multiple" -lt "$loadavg" ]; then
    projs=$(cat ~/cloud-status-reports/projs-grouped-by-host.txt | sed -n "/$proj/,/^[^[:digit:]]/p;" | awk '{print $5}' | tr '\n' ' ' )
    results="*${loadavg}* loadavg for $nproc cpus. Tested proj: *${proj}* Hosted projs: $projs
$results"
  fi
done

if [ ! -z "$results" ]; then
  curl -s -X POST -H 'Content-type: application/json' --data "{\"text\":\"Warning:\n$results\"}" $SLACK_URL
  date +"%Y-%m-%d %H:%M" >> ~/cloud-status-reports/overloaded.log
  echo "$results" >> ~/cloud-status-reports/overloaded.log
fi
