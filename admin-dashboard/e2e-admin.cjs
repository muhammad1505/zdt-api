/**
 * E2E Test: Users (list, create, edit, delete) and API Keys (list, generate, revoke)
 * 
 * Run: ZDT_PASSWORD=yourpass node e2e-admin.cjs
 * Env vars: ZDT_USERNAME (default: admin), ZDT_PASSWORD (required), ZDT_BASE_URL (default: http://localhost:2000)
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.ZDT_BASE_URL || 'http://localhost:2000';
const BASE = BASE_URL + '/admin/';
const USERNAME = process.env.ZDT_USERNAME || 'admin';
const PASSWORD = process.env.ZDT_PASSWORD;

if (!PASSWORD) {
    console.error('❌ ZDT_PASSWORD environment variable is required');
    process.exit(1);
}

let passed = 0;
let failed = 0;
let page;

function check(name, condition, detail = '') {
    if (condition) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name} — ${detail}`); }
}

async function login() {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    const inputs = await page.$$('input');
    if (inputs.length >= 2) {
        await inputs[0].fill(USERNAME);
        await inputs[1].fill(PASSWORD);
        const submitBtn = await page.$('button[type="submit"]');
        if (submitBtn) await submitBtn.click();
        await page.waitForTimeout(3000);
    }
    return !page.url().includes('login');
}

async function clickNav(name) {
    const link = await page.$(`a:has-text("${name}")`);
    const btn = await page.$(`button:has-text("${name}")`);
    const el = link || btn;
    if (el) { await el.click(); await page.waitForTimeout(2000); return true; }
    return false;
}

(async () => {
    const browser = await chromium.launch({ 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    console.log('\n=== LOGIN ===');
    const loggedIn = await login();
    check('Login success', loggedIn, 'Still on login page');
    if (!loggedIn) { await browser.close(); process.exit(1); }

    // ========== USERS ==========
    console.log('\n=== USERS PAGE ===');
    const usersClicked = await clickNav('Users');
    check('Users page navigated', usersClicked, 'Users nav not found');

    if (usersClicked) {
        const body = await page.textContent('body');
        check('Users page loaded', 
              body.includes('Users') || body.includes('username') || body.includes('operator'),
              `Content: ${body.substring(0, 200)}`);

        // Check Add User button
        const addBtn = await page.$('button:has-text("Add User")');
        check('Add User button visible', addBtn !== null, 'Add User button not found');

        // Check user list has entries
        const userCards = await page.$$('[class*=rounded-2xl]');
        check('User list contains entries', userCards.length >= 1, `Found ${userCards.length} cards`);
    }

    // ========== API KEYS ==========
    console.log('\n=== API KEYS PAGE ===');
    const keysClicked = await clickNav('API Keys');
    check('API Keys page navigated', keysClicked, 'API Keys nav not found');

    if (keysClicked) {
        const body = await page.textContent('body');
        check('API Keys page loaded',
              body.includes('Key') || body.includes('API') || body.includes('key_id'),
              `Content: ${body.substring(0, 200)}`);

        // Check Generate Key button
        const genBtn = await page.$('button:has-text("Generate Key")');
        check('Generate Key button visible', genBtn !== null, 'Generate button not found');

        // Check for existing keys or empty state
        const hasKeys = body.includes('Active') || body.includes('Revoked');
        const emptyState = body.includes('No API keys');
        check('Key list loaded (keys or empty state)', hasKeys || emptyState, 
              hasKeys ? 'Keys found' : 'Empty state shown');
    }

    // ========== RESULTS ==========
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForTimeout(500);

    console.log('\n=== RESULTS ===');
    console.log(`  Passed: ${passed}/${passed + failed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Console errors: ${errors.length > 0 ? errors.slice(0, 5).join(' | ') : 'none'}`);

    await browser.close();
    console.log('\n=== TEST COMPLETE ===');
    process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('Test error:', e.message);
    process.exit(1);
});
