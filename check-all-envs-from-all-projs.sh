#!/usr/bin/env bash

# stop on errors
# set -e
# turn on debugging
# set -x

DIR=$( cd $(dirname $0) ; pwd -P )

PARALLEL_SHELL=$(which bash)

# get all env urls from all projs
urls=""
for proj in  $(~/.magento-cloud/bin/magento-cloud projects --pipe); do
  title=$(~/.magento-cloud/bin/magento-cloud project:info -p $proj title)
  for env in $(~/.magento-cloud/bin/magento-cloud environments -p $proj --pipe -I); do
    read composer_version percent_cpu <<<$(~/.magento-cloud/bin/magento-cloud ssh -i "${DIR}/id_rsa.magento" -p $proj -e $env 'sed -n "s/.*\"version.*: \"\([^\"]*\).*$/\1/p" composer.json | tr "\n" " "; ps -p 1 -o %cpu --cumulative --no-header' 2> /dev/null)
    url=$(~/.magento-cloud/bin/magento-cloud url -p $proj -e $env --pipe | head -1)
    urls="$url $title $proj $env $composer_version $percent_cpu
    $urls"
  done
done

# get the certificate expiration date and http status of all envs (in parallel)
echo "$urls" | sed '/^[[:space:]]*$/d' | /usr/local/bin/parallel --will-cite -P 5 '
  read url title proj env <<< {}
  servername=$(echo $url | sed "s/.*\/\///;s/\/.*//")
  cert_expiration=$(echo "" |
  openssl s_client -servername $servername -connect $servername:443 2>/dev/null |
  openssl x509 -noout -enddate | 
  sed "s/notAfter=//;s/..:..:...//;s/ GMT//" |
  date -f - +"%Y-%m-%d")
  http_status=$(curl -sI -w "%{http_code}" -o /dev/null $url)
  echo $cert_expiration $http_status $url $title $proj $env
' | sort

