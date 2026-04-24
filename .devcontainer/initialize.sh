#!/bin/bash
set -euo pipefail

# Copy host's SSH public key if present
if ls ~/.ssh/id_*.pub 1>/dev/null 2>&1; then
  cat ~/.ssh/id_*.pub > .devcontainer/.ssh_authorized_keys
else
  touch .devcontainer/.ssh_authorized_keys
fi

# Copy host's tmux config if present
[ -f ~/.tmux.conf ] && cp ~/.tmux.conf .devcontainer/.tmux.conf || true
