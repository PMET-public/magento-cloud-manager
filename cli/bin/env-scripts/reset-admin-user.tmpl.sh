#! /bin/bash
php bin/magento admin:user:unlock {{defaultCloudVars.ADMIN_USER}}
php bin/magento admin:user:create --admin-user={{defaultCloudVars.ADMIN_USER}} --admin-password={{defaultCloudVars.ADMIN_PASSWORD}} \
  --admin-email={{defaultCloudVars.ADMIN_EMAIL}} --admin-firstname=Admin --admin-lastname=Username

if [ $? != 0 ]; then
  (>&2 echo 'Resetting "{{defaultCloudVars.ADMIN_USER}}" user failed')
  exit 1
fi
