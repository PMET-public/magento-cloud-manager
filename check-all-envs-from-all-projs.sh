#!/usr/bin/env bash

PARALLEL_SHELL=$(which bash)

# get all env urls from all projs
urls=""
for proj in  $(~/.magento-cloud/bin/magento-cloud projects --pipe); do
  title=$(~/.magento-cloud/bin/magento-cloud project:info -p $proj title)
  for env in $(~/.magento-cloud/bin/magento-cloud environments -p $proj --pipe -I); do
    url=$(~/.magento-cloud/bin/magento-cloud url -p $proj -e $env --pipe | head -1)
    urls="$url $title $proj $env
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

