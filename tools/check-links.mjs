import fs from 'node:fs';
import path from 'node:path';

const DOCS_FILES = [
  'README.md',
  'AGENTS.md',
  'memory.md',
  'product.md',
  'architecture.md',
  'rules.md',
  'task.md',
  'design.md',
  'docs/gestures.md',
  'docs/protocol.md',
  'docs/security-privacy.md',
  'docs/monetization.md',
  'apps/desktop/README.md',
  'apps/android/README.md',
  'packages/protocol/README.md',
];

// Check ADRs too
const adrDir = path.resolve('docs/adr');
if (fs.existsSync(adrDir)) {
  for (const f of fs.readdirSync(adrDir)) {
    if (f.endsWith('.md')) {
      DOCS_FILES.push(`docs/adr/${f}`);
    }
  }
}

let errors = 0;
let checked = 0;

for (const relPath of DOCS_FILES) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[MISSING FILE] ${relPath}`);
    errors++;
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const dir = path.dirname(fullPath);

  // Match markdown links [text](target) and images ![text](target)
  const linkRegex = /!?\[.*?\]\(([^)#]+)(?:#[^)]*)?\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const target = match[1].trim();
    if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:') || target.startsWith('#')) {
      continue;
    }
    checked++;
    const resolvedTarget = path.resolve(dir, target);
    if (!fs.existsSync(resolvedTarget)) {
      console.error(`[BROKEN LINK] in ${relPath} -> ${target} (resolved: ${resolvedTarget})`);
      errors++;
    }
  }
}

console.log(`Checked ${checked} local links across ${DOCS_FILES.length} markdown documents.`);
if (errors > 0) {
  console.error(`FAILED: Found ${errors} broken references.`);
  process.exit(1);
} else {
  console.log('PASSED: All documentation internal links resolve cleanly.');
}
