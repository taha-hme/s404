import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createApp } from './server/app.ts';
import { parseServerConfig } from './server/config.ts';
import { closePool } from './src/db/index.ts';

async function startServer() {
  const config = parseServerConfig(process.env);
  const { app, shutdown } = createApp({ config });

  if (!config.isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        maxAge: '1h',
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (filePath.endsWith(`${path.sep}sw.js`) || filePath.endsWith(`${path.sep}index.html`)) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(
      `S404 — The English League listening on http://0.0.0.0:${config.port} (${config.isProd ? 'production' : 'development'})`
    );
  });

  // Ensure Node HTTP timeouts do not prematurely drop SSE streams
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 70000;

  let closing = false;
  const handleSignal = (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`Received ${signal}, shutting down gracefully...`);
    shutdown();
    server.close(() => {
      closePool()
        .catch((err) => console.error('Error closing PostgreSQL pool:', err))
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
