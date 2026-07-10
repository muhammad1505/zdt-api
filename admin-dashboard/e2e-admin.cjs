/**
 * E2E Test: Users and API Keys pages
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

    console.log('\n=== USERS PAGE ===');
    const usersNav = await clickNav(page, 'Users');
    check('Users page navigated', usersNav, '');
    if (usersNav) {
        const body = await page.textContent('body');
        check('Users page loaded', body.includes('Users') || body.includes('username') || body.includes('operator'), '');
        check('Add User button visible', await page.$('button:has-text("Add User")') !== null, 'Add User button not found');
        check('User list has entries', (await page.$$('[class*=rounded-2xl]')).length >= 1, 'No user cards');
    }

    console.log('\n=== API KEYS PAGE ===');
    const keysNav = await clickNav(page, 'API Keys');
    check('API Keys page navigated', keysNav, '');
    if (keysNav) {
        const body = await page.textContent('body');
        check('API Keys page loaded', body.includes('Key') || body.includes('API') || body.includes('key_id'), '');
        check('Generate Key button visible', await page.$('button:has-text("Generate Key")') !== null, '');
        check('Key list or empty state', body.includes('Active') || body.includes('Revoked') || body.includes('No API keys'), '');
    }

    console.log('\n=== RESULTS ===');
    const r = getResults();
    console.log(`  Passed: ${r.passed}/${r.passed + r.failed}`);
    console.log(`  Failed: ${r.failed}`);
    await browser.close();
    process.exit(r.failed > 0 ? 1 : 0);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
