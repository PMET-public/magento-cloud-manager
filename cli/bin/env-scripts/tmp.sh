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
