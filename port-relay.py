#!/usr/bin/env python3
"""TCP relay: forward connections from 0.0.0.0:PORT -> 127.0.0.1:PORT"""
import sys, socket, threading

DEST = ('127.0.0.1', int(sys.argv[2] if len(sys.argv) > 2 else 5000))
SRC = ('0.0.0.0', int(sys.argv[1] if len(sys.argv) > 1 else 5000))

def relay(a, b):
    try:
        while True:
            d = a.recv(65536)
            if not d: break
            b.sendall(d)
    except Exception as e:
        print(f'Relay error: {e}', file=sys.stderr)
    finally:
        try: a.close()
        except Exception: pass
        try: b.close()
        except Exception: pass

def handler(client):
    upstream = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        upstream.connect(DEST)
        threading.Thread(target=relay, args=(upstream, client), daemon=True).start()
        threading.Thread(target=relay, args=(client, upstream), daemon=True).start()
    except Exception as e:
        print(f'Upstream connection failed: {e}', file=sys.stderr)
        client.close()

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(SRC)
s.listen(64)
print(f'Relaying {SRC[0]}:{SRC[1]} -> {DEST[0]}:{DEST[1]}')
while True:
    client, _ = s.accept()
    threading.Thread(target=handler, args=(client,), daemon=True).start()
