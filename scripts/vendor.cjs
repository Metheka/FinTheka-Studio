const fs = require('node:fs');
const path = require('node:path');
const dest = path.join(__dirname, '../public/vendor');
fs.mkdirSync(dest, { recursive: true });
for (const [source, target] of [
  ['@supabase/supabase-js/dist/umd/supabase.js', 'supabase.js'],
  ['lightweight-charts/dist/lightweight-charts.standalone.production.js', 'lightweight-charts.js'],
  ['@supabase/supabase-js/LICENSE', 'supabase-LICENSE.txt'],
  ['lightweight-charts/LICENSE', 'lightweight-charts-LICENSE.txt'],
]) fs.copyFileSync(path.join(__dirname, '../node_modules', source), path.join(dest, target));
console.log('Bibliotecas e licenças copiadas para public/vendor.');
