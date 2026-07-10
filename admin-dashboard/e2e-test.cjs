/**
 * E2E Test: Full user flow — Login → Settings → Services → Start/Stop → No Redirect
 * 
 * Run: ZDT_PASSWORD=yourpass node e2e-test.cjs
 * Env vars: ZDT_USERNAME (default: admin), ZDT_PASSWORD (required), ZDT_BASE_URL (default: http://localhost:2000)
 */
const { chromium } = require('playwright');
const { login: sharedLogin, clickNav, check, getResults } = require('./e2e-helpers.cjs');

const BASE_URL = process.env.ZDT_BASE_URL || 'http://localhost:2000';
const USERNAME = process.env.ZDT_USERNAME || 'admin';
const PASSWORD = process.env.ZDT_PASSWORD;

if (!PASSWORD) {
    console.error('❌ ZDT_PASSWORD environment variable is required');
    process.exit(1);
}

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    console.log('\n=== TEST 1: Admin SPA loads ===');
    await page.goto(BASE_URL + '/admin/', { waitUntil: 'networkidle', timeout: 20000 });
    check('Page loads', (await page.title()).length > 0, await page.title());
    check('Shows login form', await page.$('input') !== null, 'no input found');

    console.log('\n=== TEST 2: Login ===');
    const loginResult = await sharedLogin(page, USERNAME, PASSWORD, BASE_URL);
    check('Login succeeded', loginResult.success, `URL: ${loginResult.page.url()}`);

    const bodyAfterLogin = await page.textContent('body');
    check('Dashboard visible', bodyAfterLogin.includes('Dashboard') || bodyAfterLogin.includes('Settings'), '');

    if (loginResult.success) {
        console.log('\n=== TEST 3: Settings -> Services ===');
        const settingsClicked = await clickNav(page, 'Settings');
        check('Settings page opened', settingsClicked, 'Settings not found');

        if (settingsClicked) {
            const settingsBody = await page.textContent('body');
            const hasSvc = settingsBody.includes('Start') || settingsBody.includes('Stop') || settingsBody.includes('Running');
            check('Services tab visible', hasSvc, 'No service buttons');

            console.log('\n=== TEST 4: Start a service (CRITICAL) ===');
            const allButtons = await page.$$('button');
            let startClicked = false;
            let startedServiceName = '';

            for (const btn of allButtons) {
                const text = await btn.textContent();
                if (text.trim() === 'Start') {
                    const card = await btn.evaluate(el => {
                        const p = el.closest('[class*=rounded-2xl]');
                        return p ? (p.querySelector('[class*=font-medium]')?.textContent || '') : '';
                    });
                    startedServiceName = card || 'unknown';
                    console.log(`  Starting: "${startedServiceName}"...`);
                    startClicked = true;
                    await btn.click();
                    await page.waitForTimeout(3000);

                    const url = page.url();
                    check('NOT redirected to login!', !url.includes('login'), `Redirected to: ${url}`);
                    check('Still on admin page', url.includes('/admin/'), `URL: ${url}`);
                    
                    const body = await page.textContent('body');
                    check('Running or success toast', 
                          body.includes('Running') || body.includes('success') || body.includes('berhasil'), '');
                    break;
                }
            }

            if (!startClicked) {
                check('Start button available or service running', await page.$('text=Stop') !== null, 'No Start/Stop buttons');
            }

            // Cleanup: stop the started service
            if (startClicked && startedServiceName) {
                console.log('\n=== TEST 5: Stop service (cleanup) ===');
                await page.waitForTimeout(2000);
                const btns2 = await page.$$('button');
                for (const btn of btns2) {
                    if ((await btn.textContent()).trim() === 'Stop') {
                        await btn.click();
                        await page.waitForTimeout(3000);
                        check('NOT redirected on stop', !page.url().includes('login'), '');
                        const body = await page.textContent('body');
                        check('Stopped or success toast', body.includes('Stopped') || body.includes('berhasil'), '');
                        break;
                    }
                }
            }
        }
    }

    console.log('\n=== RESULTS ===');
    const r = getResults();
    console.log(`  Passed: ${r.passed}/${r.passed + r.failed}`);
    console.log(`  Failed: ${r.failed}`);
    await browser.close();
    process.exit(r.failed > 0 ? 1 : 0);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
