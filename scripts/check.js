import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'uploads']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const stat = statSync(p);
    if (stat.isDirectory()) {
      if (!IGNORED_DIRS.has(name)) walk(p, out);
    } else if (p.endsWith('.js') || p.endsWith('.cjs')) {
      out.push(p);
    }
  }
  return out;
}

const files = walk('.');
let failed = 0;

for (const file of files) {
  try {
    execFileSync('node', ['--check', file], { stdio: 'pipe' });
    console.log('OK  ' + file);
  } catch (err) {
    failed += 1;
    console.error('FAIL ' + file);
    const stderr = (err.stderr || err.stdout || '').toString().trim();
    if (stderr) console.error(stderr.split('\n').slice(0, 6).join('\n'));
  }
}

console.log(`\nChecked ${files.length} files, ${failed} failed.`);
process.exit(failed ? 1 : 0);
