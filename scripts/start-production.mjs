// Cross-platform production entry: npm start never accidentally launches the API-only dev mode.
process.env.NODE_ENV = 'production';
await import('../backend/dist/server.js');
