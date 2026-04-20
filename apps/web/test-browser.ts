import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', (err: any) => console.log('BROWSER ERROR:', err.message));
    page.on('requestfailed', request => console.log('BROWSER REQUEST FAILED:', request.url(), request.failure()?.errorText));

    console.log("Navigating to http://localhost:5174/ ...");
    try {
        await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0', timeout: 10000 });
    } catch (e: any) {
        if (e.message.includes('ERR_CONNECTION_REFUSED')) {
            console.log("Port 5174 refused, trying 5173...");
            await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 10000 });
        } else {
            console.error("Navigation error:", e.message);
        }
    }
    
    const editorHtml = await page.evaluate(() => {
        const editor = document.querySelector('b3-editor');
        if (!editor) return "NO b3-editor found\nDOM:" + document.body.innerHTML;
        
        const isUpgraded = editor instanceof HTMLElement && editor.constructor.name !== 'HTMLElement';
        const hasShadow = !!editor.shadowRoot;
        
        return `b3-editor found. Upgraded? ${isUpgraded}. constructor: ${editor.constructor.name}. hasShadow? ${hasShadow}`;
    });
    
    console.log("Result:", editorHtml);

    await browser.close();
})();
