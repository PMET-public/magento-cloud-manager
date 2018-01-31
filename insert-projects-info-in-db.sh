#!/usr/bin/env bash

# stop on errors
set -e
# turn on debugging
set -x

. "$( cd $(dirname $0) ; pwd -P )/lib.sh"

mapfile projects < <(${MC_CLI} projects --format=tsv | sed '1d')

for project in "${projects[@]}"; do
  read -r pid title url <<< "$project"
  # grep for magento composer version; regex accommodates old and new projects
  composer_version=$(${MC_CLI} ssh -p $pid -e ${cloud_env:-master} "egrep -m 1 'magento/product-enterprise-edition\":|\"2\.[0-9]\.[0-9]\.x-dev' composer.lock" 2>/dev/null |
    sed 's/.*: "//;s/".*//')
  sqlite3 ./sql/cloud.db "INSERT INTO projects (pid, title, url, composer_version) VALUES (\"${pid}\", \"${title}\", \"${url}\", \"${composer_version}\");"
done
