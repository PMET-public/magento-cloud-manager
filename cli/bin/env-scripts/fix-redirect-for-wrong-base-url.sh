#!/bin/bash

host=$(echo $MAGENTO_CLOUD_ROUTES | base64 -d | perl -pe 's/.*(https[^"]+cloud\/).*/\1/')

bin/magento config:set web/unsecure/base_url "$host"
bin/magento config:set web/secure/base_url "$host"
bin/magento cache:flush