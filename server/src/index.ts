import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { createCore } from './app.js';
import { config } from './config.js';
import { createRouter } from './routes/index.js';
import { createSocketServer } from './socket/index.js';

// Treo live cả buổi: một lỗi lẻ (thư viện TikTok, mạng) không được làm sập server
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

const core = createCore();
const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json());

app.get('/', (_req, res) => {
    res.json({ message: 'PTP Printer Server is running!' });
});
app.use('/api', createRouter(core));

createSocketServer(httpServer, core, config.clientOrigin);

httpServer.on('error', (err: NodeJS.ErrnoException) => {
    console.error(err.code === 'EADDRINUSE' ? `Cổng ${config.port} đang được dùng. Tắt server cũ hoặc đổi PORT.` : err);
    process.exit(1);
});

httpServer.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
    core.tiktok.autoConnectFromSettings();
});
