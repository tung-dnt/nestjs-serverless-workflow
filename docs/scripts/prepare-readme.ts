import { cp } from 'node:fs/promises';
import { join } from 'node:path';

const rootReadme = join(__dirname, '../../README.md');
const docsReadme = join(__dirname, '../docs/README.md');

async function prepareReadme() {
  try {
    await cp(rootReadme, docsReadme, { force: true });
    console.log('✓ Copied README.md from root to docs/docs/');
  } catch (error) {
    console.error('✗ Failed to copy README.md:', error);
    process.exit(1);
  }
}

prepareReadme();
