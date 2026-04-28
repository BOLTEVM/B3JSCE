import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://boltevm.com', { waitUntil: 'networkidle0' });
  
  await page.screenshot({ path: 'boltevm_screenshot.png' });
  
  console.log("Screenshot taken.");
  
  await browser.close();
})();
