import { healthCheck } from './health-check.js';

const { problems, warnings, summary } = healthCheck();

console.log(summary.join('\n'));

if (warnings.length > 0) {
  console.log(`\nUPOZORNENIA (${warnings.length}) — nasadenie nezastavujú:`);
  for (const w of warnings) console.log(`  ! ${w}`);
}

// Zhadzujeme len na rozbitých dátach. Zablokovať nasadenie kvôli drobnosti
// znamená nechať na mape staršie dáta, čo je horší výsledok než tá drobnosť.
if (problems.length > 0) {
  console.error(`\nPROBLÉMY (${problems.length}) — nenasadzujem:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exitCode = 1;
} else if (warnings.length === 0) {
  console.log('\nVšetko v poriadku.');
} else {
  console.log('\nDáta sú použiteľné, pokračujem.');
}
