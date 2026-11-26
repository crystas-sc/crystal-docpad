import 'dotenv/config';
import { buildExportApp } from './app.ts';

const port = Number(process.env.EXPORT_PORT ?? process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

const app = buildExportApp();

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
