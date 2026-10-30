#!/usr/bin/env bash
set -e

# Antror Code - Universal Linux & macOS Installer
# Installs Antror Code CLI globally without manual cloning.

echo -e "\033[38;2;255;107;53m"
cat << "EOF"
  █████╗ ███╗   ██╗████████╗██████╗  ██████╗ ██████╗ 
 ██╔══██╗████╗  ██║╚══██╔══╝██╔══██╗██╔═══██╗██╔══██╗
 ███████║██╔██╗ ██║   ██║   ██████╔╝██║   ██║██████╔╝
 ██╔══██║██║╚██╗██║   ██║   ██╔══██╗██║   ██║██╔══██╗
 ██║  ██║██║ ╚████║   ██║   ██║  ██║╚██████╔╝██║  ██║
 ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝
EOF
echo -e "\033[0m"
echo -e "\033[1mInstalling Antror Code CLI...\033[0m"

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo -e "\033[31m✖ Node.js is required but not installed.\033[0m"
  echo "Please install Node.js 20+ from https://nodejs.org or via your package manager."
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo -e "\033[33m⚠️ Warning: Node.js version $(node -v) detected. Antror Code requires Node 20+.\033[0m"
fi

# 2. Install globally via npm from GitHub repository
echo "Installing antror-code globally from GitHub..."
if npm install -g https://github.com/ArpitFalke/Antror-CLI-code.git; then
  echo -e "\033[32m✔ Successfully installed Antror Code!\033[0m"
else
  echo -e "\033[33mPermission issue detected. Retrying with sudo...\033[0m"
  sudo npm install -g https://github.com/ArpitFalke/Antror-CLI-code.git
fi

# 3. Verify installation
if command -v antror >/dev/null 2>&1; then
  echo ""
  echo -e "\033[32m✔ Antror Code is ready to use!\033[0m"
  echo "Run 'antror' in any project directory to start."
  echo ""
else
  echo -e "\033[33mNote: If 'antror' is not found, ensure npm global bin directory is in your PATH.\033[0m"
fi
