import { onRequest } from 'firebase-functions/v2/https';
import type { Express } from 'express';

const { createApiApp } = require('../../api/dist/src/server') as {
  createApiApp: () => Express;
};

const apiApp = createApiApp();

export const api = onRequest(
  {
    region: 'southamerica-east1',
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: true,
  },
  apiApp
);
