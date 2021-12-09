#! /bin/bash

# use `-n` to catch edge cases where magento did not fully deploy and so
# admin:user:unlock does not exist and magento asks "did you mean admin:user:create"
# thus hanging the script
php bin/magento admin:user:unlock -n {{magentoSIAdminUser}} || :
php bin/magento admin:user:create --admin-user={{magentoSIAdminUser}} --admin-password={{magentoSIAdminPassword}} \
  --admin-email=keithbentrup@gmail.com --admin-firstname=si --admin-lastname=only

if [ $? != 0 ]; then
  (>&2 echo '(Re)creating "{{magentoSIAdminUser}}" user failed')
  exit 1
fi

