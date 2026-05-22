import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '..');
const targets = [
  path.join(repoRoot, 'src'),
  path.join(repoRoot, 'public'),
  path.join(repoRoot, 'index.html'),
];

const allowedMatches = [
  {
    fileSuffix: path.join('src', 'components', 'LoadingScreen.jsx'),
    includes: 'signal parent',
  },
  {
    fileSuffix: path.join('src', 'components', 'dashboard', 'admin', 'AdminDetailPanel.jsx'),
    includes: 'intelligence?.signals',
  },
  {
    fileSuffix: path.join('src', 'components', 'dashboard', 'admin', 'AdminDetailPanel.jsx'),
    includes: 'for (const signal of intelligence?.signals || [])',
  },
  {
    fileSuffix: path.join('src', 'components', 'dashboard', 'admin', 'AdminDetailPanel.jsx'),
    includes: 'groups[signal.severity]',
  },
  {
    fileSuffix: path.join('src', 'components', 'dashboard', 'admin', 'AdminDetailPanel.jsx'),
    includes: 'groups[severity].push(signal)',
  },
];

const collectFiles = (targetPath) => {
  if (!fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];

  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) return collectFiles(entryPath);
    if (!/\.(jsx?|tsx?|html|css)$/i.test(entry.name)) return [];
    return [entryPath];
  });
};

const isAllowedMatch = (filePath, line) => allowedMatches.some((rule) => (
  filePath.endsWith(rule.fileSuffix) && line.includes(rule.includes)
));

describe('frontend copy guard', () => {
  it('does not expose the word signal/signals in user-facing source copy', () => {
    const violations = [];

    for (const filePath of targets.flatMap(collectFiles)) {
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!/\bsignals?\b/i.test(line)) return;
        if (isAllowedMatch(filePath, line)) return;

        violations.push(`${path.relative(repoRoot, filePath)}:${index + 1}: ${line.trim()}`);
      });
    }

    expect(violations).toEqual([]);
  });
});
