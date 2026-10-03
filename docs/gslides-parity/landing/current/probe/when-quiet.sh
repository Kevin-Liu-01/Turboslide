#!/bin/zsh
# Waits in five minute sleeps until the one minute load average is 30 or under (at most MAX_WAITS
# sleeps, default 6), then runs the command and records the load it ran at.
max=${MAX_WAITS:-6}
n=0
while true; do
  load=$(sysctl -n vm.loadavg | awk '{print $2}')
  if (( ${load%.*} < 30 )); then break; fi
  if (( n >= max )); then echo "$(date +%T) load $load after $n waits, running anyway"; break; fi
  echo "$(date +%T) load $load, waiting 300 s"
  n=$((n+1))
  sleep 300
done
echo "$(date +%T) load $load, running: $*"
"$@"
