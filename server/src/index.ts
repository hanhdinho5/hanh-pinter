import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { createCore } from './app.js';
import { config } from './config.js';
import { createRouter } from './routes/index.js';
import { createSocketServer } from './socket/index.js';

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

httpServer.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
});
