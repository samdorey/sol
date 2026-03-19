#!/bin/bash
# Install the Sol Firefox Native Messaging Bridge
# Run this script after building Sol to set up the Firefox integration.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRIDGE_SCRIPT="$SCRIPT_DIR/sol_firefox_bridge.js"
INSTALL_DIR="$HOME/.sol/bin"
INSTALL_PATH="$INSTALL_DIR/sol_firefox_bridge.js"
MANIFEST_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/sol_firefox_bridge.json"

echo "Installing Sol Firefox Bridge..."

# 1. Detect node path
NODE_PATH="$(which node 2>/dev/null || true)"
if [ -z "$NODE_PATH" ]; then
  echo "Error: Node.js not found. Please install Node.js first."
  exit 1
fi
echo "  Found Node.js at $NODE_PATH"

# 2. Copy bridge script and create launcher wrapper
mkdir -p "$INSTALL_DIR"
echo "  Copying bridge script to $INSTALL_PATH"
cp "$BRIDGE_SCRIPT" "$INSTALL_PATH"
chmod +x "$INSTALL_PATH"

# Copy the send helper script
SEND_HELPER="$SCRIPT_DIR/sol_firefox_send.sh"
if [ -f "$SEND_HELPER" ]; then
  cp "$SEND_HELPER" "$INSTALL_DIR/sol_firefox_send.sh"
  chmod +x "$INSTALL_DIR/sol_firefox_send.sh"
  echo "  Copied send helper to $INSTALL_DIR/sol_firefox_send.sh"
fi

# Create a shell wrapper that Firefox will actually launch.
# Firefox uses a minimal PATH that often doesn't include /opt/homebrew/bin,
# so we need a wrapper that invokes node with its absolute path.
WRAPPER_PATH="$INSTALL_DIR/sol_firefox_bridge_wrapper.sh"
cat > "$WRAPPER_PATH" << WRAPPER
#!/bin/bash
exec "$NODE_PATH" "$INSTALL_PATH" "\$@"
WRAPPER
chmod +x "$WRAPPER_PATH"
echo "  Created launcher wrapper at $WRAPPER_PATH"

# 3. Create native messaging host manifest (points to wrapper, not .js directly)
echo "  Installing native messaging host manifest"
mkdir -p "$MANIFEST_DIR"
cat > "$MANIFEST_PATH" << EOF
{
  "name": "sol_firefox_bridge",
  "description": "Sol macOS launcher - Firefox tab and history bridge",
  "path": "$WRAPPER_PATH",
  "type": "stdio",
  "allowed_extensions": ["sol-firefox-bridge@sol.app"]
}
EOF

# 3. Create data directory
mkdir -p "$HOME/.sol"

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Open Firefox and go to about:debugging#/runtime/this-firefox"
echo "  2. Click 'Load Temporary Add-on...'"
echo "  3. Select the manifest.json file from: $SCRIPT_DIR/../firefox-extension/"
echo "  4. For permanent installation, package the extension and install it"
echo ""
echo "Make sure Node.js is installed (the bridge script requires it)."
