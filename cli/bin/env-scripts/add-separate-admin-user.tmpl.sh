#! /bin/bash

php bin/magento admin:user:unlock {{magentoSIAdminUser}}
php bin/magento admin:user:create --admin-user={{magentoSIAdminUser}} --admin-password={{magentoSIAdminPassword}} \
  --admin-email=keithbentrup@gmail.com --admin-firstname=si --admin-lastname=only

if [ $? != 0 ]; then
  (>&2 echo '(Re)creating "{{magentoSIAdminUser}}" user failed')
  exit 1
fi

