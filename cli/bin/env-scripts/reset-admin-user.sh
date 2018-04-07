#! /bin/bash
php bin/magento admin:user:unlock admin
php bin/magento admin:user:create --admin-user=admin --admin-password=admin4tls \
  --admin-email=kbentrup@magento.com --admin-firstname=Admin --admin-lastname=Username

if [ $? != 0 ]; then
  (>&2 echo 'Resetting "admin" user failed')
  exit 1
fi

