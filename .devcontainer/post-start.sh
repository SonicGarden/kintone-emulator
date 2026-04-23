#!/bin/bash
set -euo pipefail

# Re-initialize firewall
sudo /usr/local/bin/init-firewall.sh "$(cat /etc/firewall-mode)"

# Set up SSH authorized keys from host
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cp /workspace/.devcontainer/.ssh_authorized_keys ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Copy tmux config from host if present
[ -f /workspace/.devcontainer/.tmux.conf ] && cp /workspace/.devcontainer/.tmux.conf ~/.tmux.conf || true

# Start SSH server
sudo /usr/bin/mkdir -p /run/sshd
sudo /usr/sbin/sshd
