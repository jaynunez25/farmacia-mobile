import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function listFileNames(dir) {
  try {
    return new Set(
      readdirSync(dir)
        .filter((name) => statSync(join(dir, name)).isFile()),
    );
  } catch {
    return new Set();
  }
}

const repoRoot = process.cwd();
const imagesDir = join(repoRoot, 'public', 'products', 'images');
const thumbsDir = join(repoRoot, 'public', 'products', 'thumbnails');

const images = listFileNames(imagesDir);
const thumbs = listFileNames(thumbsDir);
const missingThumb = [...images].filter((name) => !thumbs.has(name)).sort();
const missingImage = [...thumbs].filter((name) => !images.has(name)).sort();

if (missingThumb.length || missingImage.length) {
  console.error('[MEDIA CHECK] Pair mismatch detected:');
  if (missingThumb.length) {
    console.error(`  Missing thumbnails for: ${missingThumb.join(', ')}`);
  }
  if (missingImage.length) {
    console.error(`  Missing images for: ${missingImage.join(', ')}`);
  }
  process.exit(1);
}

const dirty = execSync('git status --porcelain public/products', { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('[MEDIA CHECK] Uncommitted media changes detected in public/products:');
  console.error(dirty);
  console.error('Commit + push these files so Vercel serves them.');
  process.exit(1);
}

console.log('[MEDIA CHECK] OK: media pairs aligned and committed.');
