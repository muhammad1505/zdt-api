/**
 * E2E Test: Files, VPN, Tools, Logs features
 * 
 * Run: ZDT_PASSWORD=yourpass node e2e-features.cjs
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
    // Try sidebar link first, then any element with that text
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

    if (!loggedIn) {
        console.log('Cannot continue - login failed');
        await browser.close();
        process.exit(1);
    }

    // ========== FILES PAGE ==========
    console.log('\n=== FILES FEATURE ===');
    const filesClicked = await clickNav('Files');
    check('Files page navigated', filesClicked, 'Files nav not found');

    if (filesClicked) {
        const body = await page.textContent('body');
        check('Files page loaded', 
              body.includes('File') || body.includes('Music') || body.includes('Download'),
              `Content: ${body.substring(0, 200)}`);
        // Only check for actual alert role elements (not buttons with error CSS classes)
        const alertEl = await page.$('[role=alert], .swal2-container');
        check('No visible error alert on Files', 
              !alertEl, 
              'Error alert element found');
    }

    // ========== VPN FEATURE ==========
    console.log('\n=== VPN FEATURE ===');
    // VPN is inside Settings tab
    const settingsClicked = await clickNav('Settings');
    check('Settings page navigated', settingsClicked, 'Settings nav not found');

    if (settingsClicked) {
        // Click VPN tab
        const vpnTab = await page.$('button:has-text("VPN")');
        if (vpnTab) {
            await vpnTab.click();
            await page.waitForTimeout(2000);
            const vpnBody = await page.textContent('body');
            check('VPN tab loaded', 
                  vpnBody.includes('Connect') || vpnBody.includes('Disconnect') || vpnBody.includes('VPN'),
                  `Content: ${vpnBody.substring(0, 200)}`);
            check('VPN config visible',
                  vpnBody.includes('SERVER') || vpnBody.includes('USERNAME') || vpnBody.includes('Config'),
                  'VPN config fields not found');
        } else {
            check('VPN tab found', false, 'VPN tab button not found');
        }
    }

    // ========== TOOLS FEATURE ==========
    console.log('\n=== TOOLS FEATURE ===');
    const toolsClicked = await clickNav('Tools');
    check('Tools page navigated', toolsClicked, 'Tools nav not found');

    if (toolsClicked) {
        const toolsBody = await page.textContent('body');
        check('Tools page loaded',
              toolsBody.includes('Tool') || toolsBody.includes('Dependencies') || toolsBody.includes('Install'),
              `Content: ${toolsBody.substring(0, 200)}`);
        check('No error on Tools',
              !toolsBody.includes('Error') && !toolsBody.includes('error'),
              'Error text found');
    }

    // ========== LOGS PAGE ==========
    console.log('\n=== LOGS FEATURE ===');
    const logsClicked = await clickNav('Logs');
    check('Logs page navigated', logsClicked, 'Logs nav not found');

    if (logsClicked) {
        const logsBody = await page.textContent('body');
        check('Logs page loaded',
              logsBody.includes('Log') || logsBody.includes('Activity') || logsBody.includes('Endpoint'),
              `Content: ${logsBody.substring(0, 200)}`);
    }

    // ========== RESULTS ==========
    console.log('\n=== RESULTS ===');
    console.log(`  Passed: ${passed}/${passed + failed}`);
    console.log(`  Failed: ${failed}`);

    // Collect console errors
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForTimeout(500);
    if (errors.length > 0) {
        console.log(`  Console errors: ${errors.slice(0, 5).join(' | ')}`);
    } else {
        console.log('  Console errors: none');
    }

    await browser.close();
    console.log('\n=== TEST COMPLETE ===');
    process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('Test error:', e.message);
    process.exit(1);
});
