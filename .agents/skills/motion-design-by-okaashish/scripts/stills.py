# Usage: python stills.py page.html out_dir 0.5,3,8.2 [width]  -> out_dir/f_<t>.png per time via window.__comp.capture
import sys, base64, threading, http.server, functools, os
from playwright.sync_api import sync_playwright
page_path, out_dir = sys.argv[1], sys.argv[2]
times = [float(x) for x in sys.argv[3].split(',')]
width = int(sys.argv[4]) if len(sys.argv) > 4 else 360
d = os.path.dirname(os.path.abspath(page_path))
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=d)
H.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/{os.path.basename(page_path)}?t=0')
    pg.wait_for_function('window.__comp')
    for t in times:
        url = pg.evaluate(f'window.__comp.capture({t},{width})')
        open(os.path.join(out_dir, f'f_{t:05.2f}.png'), 'wb').write(base64.b64decode(url.split(',')[1]))
    print('errors:', errs)
    b.close()
