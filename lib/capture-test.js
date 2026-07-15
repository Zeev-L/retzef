// Probe: shows exactly what one capture returns on this Mac. Run: npm run capture-test
const { capture } = require('./capture');
(async () => {
  const s = await capture();
  if (!s) { console.error('capture() returned null — check Accessibility permission'); process.exit(1); }
  console.log(JSON.stringify(s, null, 2));
})();
