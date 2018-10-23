#!/usr/bin/env bash

# create the next db migrate dir
lastDir=$(find dbmigrate* -type d 2> /dev/null | tail -1 | perl -pe 's/dbmigrate0?//')
n=$((lastDir+1))
dir=dbmigrate$(printf "%02d" $n)
mkdir $dir

# create new tables from originals
perl -pe 's/" \($/_new" \(/' cloud.sql > $dir/1-create-new-tables.sql

# insert old values into new tables
perl -ne 's/^.`(.*)`.*/\1/ and print "$1, "; 
  s/CREATE TABLE..(.*)".*$/\n${1} (/ and chomp and print' cloud.sql > $dir/2-copy-into-new-tables.sql

perl -i -ne 's/^(.*?) \((.*), $/insert into ${1}_new \(${2}\) select * from ${1};/
  and print' $dir/2-copy-into-new-tables.sql

# drop old tables and rename new tables
perl -ne 's/^CREATE TABLE "(.*)".*$/DROP TABLE ${1}; ALTER TABLE ${1}_new RENAME TO ${1};/ 
  and print' cloud.sql > $dir/3-drop-old-rename-new-tables.sql

echo -n "Backing up db ... "
cp cloud.db cloud.bak.db
echo -e "ok.\n"

echo -e "Modify \033[92m$dir/1-create-new-tables.sql\033[0m with your changes and then run:"
echo -e "  \033[32mcat $dir/*-new-tables.sql | sqlite3 cloud.db; sqlite3 cloud.db 'VACUUM;'\033[0m\n"
echo "If you're satisfied with the changes, commit the updated schema output from"
echo -e " \033[32msqlite3 cloud.db .schema > cloud.sql\033[0m"
echo -e "and the \033[92m$dir/*.sql\033[0m files.\n"
