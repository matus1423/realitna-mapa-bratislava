import { healthCheck } from './health-check.js';

const { problems, summary } = healthCheck();

console.log(summary.join('\n'));

if (problems.length > 0) {
  console.error(`\nPROBLÉMY (${problems.length}):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exitCode = 1;
} else {
  console.log('\nVšetko v poriadku.');
}
