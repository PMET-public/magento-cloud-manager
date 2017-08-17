#!/usr/bin/env bash


# stop on errors
# set -e
# turn on debugging
# set -x

for proj in $(~/.magento-cloud/bin/magento-cloud projects --pipe); do
  deactivated_log=$(~/.magento-cloud/bin/magento-cloud activity:list -p $proj -e master -a --limit=150 2>/dev/null| grep 'deactivated environment' | awk '{print $4 " " $(NF-1)}')
  # reverse order with 'tail -r' so inactive child envs deleted first 
  for inactive_env in $(~/.magento-cloud/bin/magento-cloud environments -p $proj 2>/dev/null | grep Inactive | awk '{print $2}' | tail -r); do
    deactivated_date=$(echo "${deactivated_log}" | sed -n "s/ $inactive_env\$//p" | head -1)
    #echo "$proj $inactive_env $deactivated_date"
    days_since_deactivation=$(echo "( $(date +%s) - $(date -d "${deactivated_date}" +%s) ) / (24*60*60)" | bc -l | awk '{printf "%.0f", $1}')
    if [ "${days_since_deactivation}" -gt "30" ]; then
       echo ~/.magento-cloud/bin/magento-cloud environment:delete -p $proj --no-wait -y -e $inactive_env
    fi
  done
done

