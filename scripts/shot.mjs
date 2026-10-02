// Usage: node scripts/shot.mjs "<url>" out.png [width height waitMs]
import {chromium} from 'playwright-core';
const [url, out = 'test-results/shot.png', w = '1280', h = '720', wait = '6000'] = process.argv.slice(2);
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({viewport: {width: Number(w), height: Number(h)}});
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto(url);
await page.waitForTimeout(Number(wait));
await page.screenshot({path: out});
console.log(logs.slice(0, 25).join('\n') || 'no console output');
await browser.close();
