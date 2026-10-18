import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const names = execFileSync('git', ['ls-files', '-z'])
  .toString()
  .split('\0')
  .filter(Boolean);
const failures = [];
const token =
  /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
for (const name of names) {
  if (
    /(^|\/)(node_modules|dist|coverage|test-results|playwright-report)\/|\.tsbuildinfo$|(^|\/)\.env(?:$|\.(?!example$))/.test(
      name,
    )
  )
    failures.push(name);
  if (
    !/\.(png|jpg|jpeg|webp|gif)$/.test(name) &&
    token.test(readFileSync(name, 'utf8'))
  )
    failures.push(name);
}
if (failures.length) {
  console.error('Repository safety check failed for paths:', [
    ...new Set(failures),
  ]);
  process.exitCode = 1;
} else
  console.log(
    `Repository safety check passed (${names.length} tracked files; artifact/secret patterns only, not a universal secret guarantee).`,
  );
