// Production entry point (`npm run start`). A thin wrapper around Next's own request handler whose only job is
// to REPLACE X-Forwarded-For with the TCP peer address before Next proxies /api/* to the API. Next's external
// rewrite forwards request headers verbatim and never appends the client address, and neither proxy.ts nor a
// Route Handler can see the socket, so this is the only layer that knows who is actually connected. The API
// (TRUST_PROXY=1) keys its rate limits on the rightmost X-Forwarded-For entry, which is therefore always this value.
import { createServer } from 'node:http';
import next from 'next';

const port = Number(process.env.PORT) || 3000;
const app = next({ dev: false, dir: import.meta.dirname });
const handle = app.getRequestHandler();

await app.prepare();
createServer((req, res) => {
  req.headers['x-forwarded-for'] = req.socket.remoteAddress ?? 'unknown';
  handle(req, res);
}).listen(port, process.env.HOST, () => console.log(`[web] listening on :${port}`));
