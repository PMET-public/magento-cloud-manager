#! /bin/bash
# kill php for up to 30 min 
{ for i in {1..30}; do pkill php; sleep 60; done; } &>/dev/null &
