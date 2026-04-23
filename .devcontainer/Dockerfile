FROM node:22-bookworm

ARG TZ
ENV TZ="$TZ"

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.utf8
ENV LC_ALL=C.utf8

# Install basic development tools and iptables/ipset
RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  dnsmasq \
  aggregate \
  jq \
  nano \
  ripgrep \
  vim \
  tmux \
  openssh-server \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Rename node user to dev
RUN usermod -l dev -d /home/dev -m node && groupmod -n dev node && \
  mkdir -p /usr/local/share/npm-global && \
  chown -R dev:dev /usr/local/share

ARG USERNAME=dev

# Persist command history
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions
RUN mkdir -p /workspace /home/dev/.claude && \
  chown -R dev:dev /workspace /home/dev/.claude

WORKDIR /workspace

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  sudo dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Set up non-root user
USER dev

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin:/home/dev/.local/bin

# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Set the default editor and visual
ENV EDITOR=code
ENV VISUAL=code

# Default powerline10k theme
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Set up VS Code remote CLI for SSH sessions
RUN cat <<'EOF' >> ~/.zshrc

# VS Code remote CLI (only when not in VS Code integrated terminal)
if [ -z "$VSCODE_IPC_HOOK_CLI" ]; then
  VSCODE_CLI_DIR=$(ls -td /vscode/vscode-server/bin/linux-x64/*/bin/remote-cli 2>/dev/null | head -1)
  if [ -n "$VSCODE_CLI_DIR" ]; then
    export PATH="$VSCODE_CLI_DIR:$PATH"
    export VSCODE_IPC_HOOK_CLI=$(ls -t /tmp/vscode-ipc-*.sock 2>/dev/null | head -1)
  fi
fi
EOF

ARG PNPM_VERSION=10.30.2

# Install pnpm and zsh completion
RUN npm install -g pnpm@${PNPM_VERSION} \
  && mkdir -p /usr/local/share/zsh/site-functions \
  && pnpm completion zsh > /usr/local/share/zsh/site-functions/_pnpm

# Install Claude Code
RUN curl -fsSL https://claude.ai/install.sh | bash

# Pre-create directories for named volume mounts (owned by dev user)
RUN mkdir -p \
  /workspace/.pnpm-store \
  /workspace/node_modules \
  /workspace/packages/cli/node_modules \
  /workspace/packages/core/node_modules \
  /workspace/packages/server/node_modules

# Firewall mode: restrict (default) or observe (for domain discovery)
ARG FIREWALL_MODE=restrict

# Copy and set up firewall script.
# Create dnsmasq log file owned by nobody at build time to avoid permission issues at runtime.
COPY init-firewall.sh test-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh /usr/local/bin/test-firewall.sh && \
  echo "dev ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh ${FIREWALL_MODE}, /usr/local/bin/test-firewall.sh, /usr/bin/mkdir -p /run/sshd, /usr/sbin/sshd" > /etc/sudoers.d/dev-firewall && \
  chmod 0440 /etc/sudoers.d/dev-firewall && \
  echo "${FIREWALL_MODE}" > /etc/firewall-mode && chmod 644 /etc/firewall-mode && \
  touch /var/log/dnsmasq.log && chown nobody:nogroup /var/log/dnsmasq.log
USER dev
