import {chromium} from 'playwright-core';
const url = process.argv[2] || 'http://localhost:3001';
const out = process.argv[3] || 'test-results/probe.png';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto(url);
await page.waitForTimeout(4000);
await page.screenshot({path: out});
console.log(logs.join('\n'));
console.log(await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  return gl ? gl.getParameter(gl.VERSION) + ' | ' + (gl.getExtension('WEBGL_debug_renderer_info') ? gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL) : '') : 'no webgl2';
}));
await browser.close();
