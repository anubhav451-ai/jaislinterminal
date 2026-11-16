// Runs first in `npm run build`: stops with a clear message if part of the project was not uploaded to the repository.
import { existsSync } from 'node:fs';

const need = ['client/package.json', 'client/index.html', 'client/src/main.jsx', 'server/yahooApi.js', 'worker/index.js'];
const missing = need.filter((f) => !existsSync(f));
if (missing.length) {
  console.error('\n[build] These files are missing in the repository:\n  - ' + missing.join('\n  - '));
  console.error('\nUpload the WHOLE project folder (client/, server/, worker/, functions/, package.json ...) to the repository root,');
  console.error('so that client/package.json sits directly inside the folder that Cloudflare builds (Root directory = empty).\n');
  process.exit(1);
}
console.log('[build] project structure OK');
