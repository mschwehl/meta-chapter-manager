const https = require('https');
const fs = require('fs');
const path = require('path');

const vendorDir = path.join(__dirname, 'client', 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });

const downloads = [
  {
    url: 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
    file: 'tailwindcss-browser.js',
  },
  {
    url: 'https://unpkg.com/vue@3/dist/vue.global.prod.js',
    file: 'vue.global.prod.js',
  },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    function get(u) {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let next = res.headers.location;
          if (next.startsWith('/')) {
            const parsed = new URL(u);
            next = parsed.origin + next;
          }
          get(next);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          fs.writeFileSync(dest, buf);
          resolve(buf.length);
        });
        res.on('error', reject);
      }).on('error', reject);
    }
    get(url);
  });
}

(async () => {
  for (const d of downloads) {
    const dest = path.join(vendorDir, d.file);
    try {
      const size = await download(d.url, dest);
      console.log(`OK  ${d.file} (${(size / 1024).toFixed(1)} KB)`);
    } catch (e) {
      console.error(`FAIL ${d.file}: ${e.message}`);
    }
  }
  console.log('Done.');
})();
