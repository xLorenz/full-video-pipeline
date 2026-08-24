#!/usr/bin/env bash
# Shim: delegates to the cross-platform Python checker so `bash scripts/check_system.sh`
# keeps working for existing muscle memory / CI that calls it.
exec python3 "$(dirname "$0")/check_system.py" "$@"
