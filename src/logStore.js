import fs from 'fs';
import path from 'path';
import { log, warn } from './utils/logger.js';

function normalizeLine(s) {
  return (s || '')
    .normalize('NFKC')
    .replace(/[»“”"‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log('Created directory:', dir);
  }
}

export function logPathForCategory(baseDir, category) {
  const safe = category.replace(/[^a-z0-9_-]/gi, '_');
  return path.join(baseDir, `${safe}.txt`);
}

export function hasLine(filePath, line) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  const target = normalizeLine(line);
  return content
    .split('\n')
    .map(normalizeLine)
    .some(l => l === target);
}

export function appendLine(filePath, line) {
  try {
    fs.appendFileSync(filePath, normalizeLine(line) + '\n', 'utf8');
  } catch (e) {
    warn('Failed to append to log', filePath, e.message);
  }
}
