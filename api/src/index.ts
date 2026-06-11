import { createApiApp } from './server';

const port = Number(process.env.PORT ?? 7071);
const host = process.env.HOST ?? '0.0.0.0';
const app = createApiApp();

app.listen(port, host, () => {
  console.log(`Drive Navigator API em http://${host}:${port}/api/health`);
});
