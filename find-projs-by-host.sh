#!/usr/bin/env bash

# get all uptimes from all projs

DIR=$( cd $(dirname $0) ; pwd -P )

uptimes=""
for proj in  $(~/.magento-cloud/bin/magento-cloud projects --pipe); do
  title=$(~/.magento-cloud/bin/magento-cloud project:info -p $proj title)
  uptime=$(~/.magento-cloud/bin/magento-cloud ssh -i "${DIR}/id_rsa.magento" -p $proj -e master "uptime -s | xargs echo -n; echo -n ' '; echo $proj $title" 2> /dev/null)
  uptimes="$uptime
$uptimes"
done

echo "$uptimes" | dos2unix | sed '/^[[:space:]]*$/d' | sort | awk '{if ((a != $1 || b != $2) && NR != 1) {print "----"; c=0} a=$1; b=$2; c++; print c " " $0}' 

