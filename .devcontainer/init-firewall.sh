#!/bin/bash
# Firewall initialization for devcontainer.
#
# Usage:
#   init-firewall.sh [observe|restrict]
#
# observe  (default) - Log all DNS queries, allow all HTTP/HTTPS outbound.
#                      Use this to discover which domains are accessed.
# restrict           - Block DNS queries to unlisted domains via allowed-domains.conf.
#                      Also block outbound to IPs not resolved by dnsmasq,
#                      preventing direct IP access that bypasses DNS filtering.

set -euo pipefail
IFS=$'\n\t'

MODE="${1:-observe}"

if [[ "$MODE" != "observe" && "$MODE" != "restrict" ]]; then
  echo "Usage: $0 [observe|restrict]" >&2
  exit 1
fi

CONF_DIR=/workspace/.devcontainer

echo "Starting dnsmasq (${MODE} mode)..."
pkill dnsmasq 2>/dev/null || true

if [[ "$MODE" == "restrict" ]]; then
  # Create ipset for tracking IPs resolved by dnsmasq (flush if already exists)
  ipset create allowed_ips hash:ip hashsize 4096 maxelem 65536 2>/dev/null || ipset flush allowed_ips

  # Auto-generate ipset directives from server= entries in allowed-domains.conf.
  # This tells dnsmasq to add every resolved IP to the allowed_ips ipset automatically.
  grep -v '^\s*#' "${CONF_DIR}/allowed-domains.conf" | grep -oP 'server=/\K[^/]+' | sort -u | \
    awk 'BEGIN{printf "ipset="} {printf "/%s",$0} END{print "/allowed_ips"}' > /tmp/dnsmasq-ipset.conf

  # Combine main config with generated ipset config
  cat "${CONF_DIR}/dnsmasq.conf" /tmp/dnsmasq-ipset.conf > /tmp/dnsmasq-combined.conf
  dnsmasq --conf-file=/tmp/dnsmasq-combined.conf
else
  dnsmasq --conf-file="${CONF_DIR}/dnsmasq-observe.conf"
fi

# Make log readable by container user (dnsmasq runs as nobody)
chmod 644 /var/log/dnsmasq.log

# Route all DNS through local dnsmasq (keep Docker embedded DNS as fallback for service names)
echo -e "nameserver 127.0.0.1\nnameserver 127.0.0.11" > /etc/resolv.conf

echo "Initializing firewall..."

# Flush existing rules
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X

# Default policies
iptables -P INPUT ACCEPT
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow Docker internal network
iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT
iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT

# Allow established/related connections
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow dnsmasq (runs as nobody) to query upstream DNS servers
iptables -A OUTPUT -p udp --dport 53 -m owner --uid-owner nobody -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -m owner --uid-owner nobody -j ACCEPT

# Allow other processes to use local dnsmasq only
iptables -A OUTPUT -p udp --dport 53 -d 127.0.0.1 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -d 127.0.0.1 -j ACCEPT

# Allow Docker embedded DNS (for service name resolution)
iptables -A OUTPUT -p udp --dport 53 -d 127.0.0.11 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -d 127.0.0.11 -j ACCEPT

if [[ "$MODE" == "restrict" ]]; then
  # Allow HTTP/HTTPS/SSH only to IPs that dnsmasq resolved (in allowed_ips ipset).
  # Direct IP access without DNS resolution is blocked.
  iptables -A OUTPUT -p tcp --dport 80 -m set --match-set allowed_ips dst -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 443 -m set --match-set allowed_ips dst -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 22 -m set --match-set allowed_ips dst -j ACCEPT
else
  # Observe mode: allow all outbound HTTP/HTTPS/SSH
  iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
fi

# Log and drop everything else (to detect non-HTTP/HTTPS outbound)
iptables -A OUTPUT -j LOG --log-prefix "[BLOCKED] " --log-level 4
iptables -A OUTPUT -j DROP

echo "Firewall initialized (${MODE} mode)."
echo ""
echo "To observe DNS queries:   tail -f /var/log/dnsmasq.log | grep query"
if [[ "$MODE" == "restrict" ]]; then
  echo "To view allowed IPs:      sudo ipset list allowed_ips"
  echo "To test firewall rules:   sudo test-firewall.sh"
fi
