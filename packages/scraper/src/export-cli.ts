import { exportStatic } from './export-static.js';

const result = exportStatic();
console.log(
  `Export: ${result.markers} inzerátov, ${(result.bytes / 1024 / 1024).toFixed(1)} MB`,
);
