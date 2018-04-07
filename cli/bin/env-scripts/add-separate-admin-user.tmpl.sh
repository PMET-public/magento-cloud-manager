#! /bin/bash
php bin/magento admin:user:unlock {{magentoAdminUser}}
php bin/magento admin:user:create --admin-user={{magentoAdminUser}} --admin-password={{magentoAdminPassword}} \
  --admin-email=keithbentrup@gmail.com --admin-firstname=si --admin-lastname=only

if [ $? != 0 ]; then
  (>&2 echo '(Re)creating "{{magentoAdminUser}}" user failed')
  exit 1
fi

