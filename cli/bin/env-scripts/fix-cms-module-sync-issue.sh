#!/bin/bash

mysql main -sN -h database.internal -e "update setup_module set data_version = '0.0.2' where module = 'MagentoEse_CmsSampleDataUpdate';"

php ./vendor/bin/ece-tools deploy

php ./vendor/bin/ece-tools post-deploy
