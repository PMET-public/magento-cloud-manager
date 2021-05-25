#!/usr/bin/env bash

if [[ $(which fnm) ]]; then
  fnm use
elif [[ $(which nvm) ]]; then
  nvm use
fi

node "$@"
