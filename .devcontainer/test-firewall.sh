#!/bin/bash
# Test firewall rules in restrict mode.
#
# Usage:
#   sudo test-firewall.sh
#
# Verifies that:
#   1. Allowed domains are accessible
#   2. Direct IP access (bypassing DNS) is blocked
#   3. Unlisted domains are blocked

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "${GREEN}PASS${NC}: $1"; ((PASS++)) || true; }
fail() { echo -e "${RED}FAIL${NC}: $1"; ((FAIL++)) || true; }

# Record current DROP packet count
drops_before=$(iptables -L OUTPUT -v -n | awk '$3=="DROP"{print $1}')

echo "=== Firewall Test (restrict mode) ==="
echo ""

# 1. Allowed domain should succeed
echo "--- Allowed domain ---"
if curl -sI --connect-timeout 5 https://github.com > /dev/null 2>&1; then
  pass "allowed domain (github.com) is accessible"
else
  fail "allowed domain (github.com) is NOT accessible"
fi

# 2. Direct IP access should be blocked (bypass DNS with --resolve)
echo "--- Direct IP access ---"
if curl -sI --connect-timeout 5 --resolve "direct-ip-test:443:1.1.1.1" https://direct-ip-test > /dev/null 2>&1; then
  fail "direct IP access (1.1.1.1) should be blocked"
else
  pass "direct IP access (1.1.1.1) is blocked"
fi

# 3. Unlisted domain should be blocked
echo "--- Unlisted domain ---"
if curl -sI --connect-timeout 5 https://example.com > /dev/null 2>&1; then
  fail "unlisted domain (example.com) should be blocked"
else
  pass "unlisted domain (example.com) is blocked"
fi

# 4. Verify DROP counter increased
echo "--- DROP counter ---"
drops_after=$(iptables -L OUTPUT -v -n | awk '$3=="DROP"{print $1}')
if [[ "$drops_after" -gt "$drops_before" ]]; then
  pass "DROP counter increased (${drops_before} -> ${drops_after})"
else
  fail "DROP counter did not increase (${drops_before} -> ${drops_after})"
fi

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
exit "$FAIL"
