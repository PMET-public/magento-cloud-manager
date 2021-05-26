#!/bin/bash

# use for 1 off cmds
# curl -s https://ipinfo.io/ip 2>/dev/null

# fix 2.3.3 demo upgrades
# mysql main -sN -h database.internal -e "delete t1 FROM catalog_category_product t1 INNER JOIN catalog_category_product t2 WHERE t1.entity_id > t2.entity_id AND t1.category_id = t2.category_id and  t1.product_id = t2.product_id;"
# php bin/magento setup:upgrade
# php bin/magento setup:static-content:deploy
# php bin/magento cache:flush
# rm var/.maintenance.flag 

# fix broken cron
# sed -i "/'enabled' => 0/d" /app/app/etc/env.php

# mysql main -sN -h database.internal -e "update core_config_data set value = replace(value, 'http:', 'https:') where path = 'web/unsecure/base_url'"
# perl -i -pe "s/.*engine.*elasticsuite.*/'engine' => 'elasticsearch6','elasticsearch6_server_hostname' => 'elasticsearch.internal','elasticsearch6_server_port' => '9200',/" app/etc/env.php
# bin/magento app:config:import
# php bin/magento indexer:reindex
# php bin/magento cache:flush

# [[ -d /app/var/export ]] && chmod 775 /app/var/export && ls -al /app/var/export/
# [[ -d /app/var/export/email ]] && chmod 775 /app/var/export/email && ls -al /app/var/export/email/