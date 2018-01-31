#!/usr/bin/env bash

# stop on errors
set -e
# turn on debugging
set -x
# export vars
set -a

get_projects() {
  ${MC_CLI} projects --pipe
}

MC_CLI=~/.magento-cloud/bin/magento-cloud
