"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const https_1 = require("firebase-functions/v2/https");
const { createApiApp } = require('../../api/dist/src/server');
const apiApp = createApiApp();
exports.api = (0, https_1.onRequest)({
    region: 'southamerica-east1',
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: true,
}, apiApp);
//# sourceMappingURL=index.js.map