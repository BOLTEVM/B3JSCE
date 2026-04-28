import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://boltevm.com', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 10000)); // wait 10s for animations/loading
  await page.screenshot({ path: 'boltevm_after_10s.png' });
  console.log("Screenshot after 10s taken.");
  await browser.close();
})();
