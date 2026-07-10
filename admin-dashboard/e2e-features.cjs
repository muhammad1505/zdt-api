/**
 * E2E Test: Files, VPN, Tools, Logs features
 * Env vars: ZDT_USERNAME (default: admin), ZDT_PASSWORD (required), ZDT_BASE_URL (default: http://localhost:2000)
 */
const { chromium } = require('playwright');
const { login: sharedLogin, clickNav, check, getResults } = require('./e2e-helpers.cjs');

const BASE_URL = process.env.ZDT_BASE_URL || 'http://localhost:2000';
const USERNAME = process.env.ZDT_USERNAME || 'admin';
const PASSWORD = process.env.ZDT_PASSWORD;
if (!PASSWORD) { console.error('ZDT_PASSWORD required'); process.exit(1); }

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    console.log('\n=== LOGIN ===');
    const loginOk = (await sharedLogin(page, USERNAME, PASSWORD, BASE_URL)).success;
    check('Login success', loginOk, '');
    if (!loginOk) { await browser.close(); process.exit(1); }

    console.log('\n=== FILES ===');
    const filesNav = await clickNav(page, 'Files');
    check('Files page navigated', filesNav, '');
    if (filesNav) {
        const body = await page.textContent('body');
        check('Files page loaded', body.includes('File') || body.includes('Music') || body.includes('Download'), '');
    }

    console.log('\n=== VPN (via Settings) ===');
    const settingsNav = await clickNav(page, 'Settings');
    check('Settings page navigated', settingsNav, '');
    if (settingsNav) {
        const vpnTab = await page.$('button:has-text("VPN")');
        if (vpnTab) {
            await vpnTab.click();
            await page.waitForTimeout(2000);
            const body = await page.textContent('body');
            check('VPN tab loaded', body.includes('Connect') || body.includes('Disconnect') || body.includes('VPN'), '');
            check('VPN config visible', body.includes('SERVER') || body.includes('USERNAME') || body.includes('Config'), '');
        } else {
            check('VPN tab found', false, 'VPN tab button not found');
        }
    }

    console.log('\n=== TOOLS ===');
    const toolsNav = await clickNav(page, 'Tools');
    check('Tools page navigated', toolsNav, '');
    if (toolsNav) {
        const body = await page.textContent('body');
        check('Tools page loaded', body.includes('Tool') || body.includes('Dependencies') || body.includes('Install'), '');
    }

    console.log('\n=== LOGS ===');
    const logsNav = await clickNav(page, 'Logs');
    check('Logs page navigated', logsNav, '');
    if (logsNav) {
        const body = await page.textContent('body');
        check('Logs page loaded', body.includes('Log') || body.includes('Activity') || body.includes('Endpoint'), '');
    }

    console.log('\n=== RESULTS ===');
    const r = getResults();
    console.log(`  Passed: ${r.passed}/${r.passed + r.failed}`);
    console.log(`  Failed: ${r.failed}`);
    await browser.close();
    process.exit(r.failed > 0 ? 1 : 0);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
