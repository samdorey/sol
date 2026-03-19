#!/bin/bash
# Send a JSON command to the Firefox bridge via Unix socket
# Usage: sol_firefox_send.sh <cmd-file> <socket-path>
CMD_FILE="$1"
SOCK_PATH="$2"
if [ ! -f "$CMD_FILE" ] || [ ! -S "$SOCK_PATH" ]; then
  exit 0
fi
/usr/bin/python3 -c "
import socket,struct
msg = open('$CMD_FILE','rb').read().strip()
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect('$SOCK_PATH')
s.sendall(struct.pack('<I', len(msg)) + msg)
s.close()
" 2>/dev/null
rm -f "$CMD_FILE" 2>/dev/null
