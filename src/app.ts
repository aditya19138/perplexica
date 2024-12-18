import { startWebSocketServer } from './websocket';
import express from 'express';
import cors from 'cors';
import http from 'http';
import routes from './routes';
import { getPort } from './config';
import logger from './utils/logger';
import fs from 'fs';
import path from 'path';


const port = getPort();

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: '*',
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

// Directory to save HTML files
const htmlFilesDir = path.join(__dirname, 'html_files');
if (!fs.existsSync(htmlFilesDir)) {
  fs.mkdirSync(htmlFilesDir); // Create directory if it doesn't exist
}

// Serve static files from 'html_files'
app.use('/html_files', express.static(htmlFilesDir));

app.use('/api', routes);
app.get('/api', (_, res) => {
  res.status(200).json({ status: 'ok' });
});

server.listen(port, () => {
  logger.info(`Server is running on port ${port}`);
});

startWebSocketServer(server);

process.on('uncaughtException', (err, origin) => {
  logger.error(`Uncaught Exception at ${origin}: ${err}`);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});
