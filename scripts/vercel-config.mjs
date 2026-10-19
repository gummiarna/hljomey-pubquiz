// Býr til web/config.js úr umhverfisbreytum þegar Vercel byggir síðuna.
// Lyklarnir eru því aldrei í þessu opna safni. Í Vercel: Settings -> Environment Variables
//   SUPABASE_URL       t.d. https://xxxx.supabase.co
//   SUPABASE_ANON_KEY  „anon public“ lykillinn (eða sb_publishable_...)
//   EVENT_TAG          valfrjálst, t.d. hljomey-2027
import { writeFileSync } from 'node:fs';

const url = (process.env.SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_ANON_KEY || '').trim();
const tag = (process.env.EVENT_TAG || 'hljomey-2027').trim();

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || key.length < 20) {
  console.error('Vantar SUPABASE_URL eða SUPABASE_ANON_KEY í umhverfisbreytum Vercel. Hætti við útgáfu.');
  process.exit(1);
}
const cfg = { SUPABASE_URL: url, SUPABASE_ANON_KEY: key, EVENT_TAG: tag };
writeFileSync(new URL('../web/config.js', import.meta.url),
  '// Búið til sjálfkrafa við útgáfu á Vercel (scripts/vercel-config.mjs)\nwindow.PQ_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n');
console.log('config.js búið til fyrir', url);
