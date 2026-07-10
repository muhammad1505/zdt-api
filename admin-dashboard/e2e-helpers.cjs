/**
 * Shared E2E Test Helpers
 * 
 * Provides login(), clickNav(), and check() functions for all E2E test files.
 * 
 * Usage:
 *   const { login, clickNav, check, getResults } = require('./e2e-helpers.cjs');
 *   const page = await browser.newPage();
 *   await login(page, USERNAME, PASSWORD);
 */
let passed = 0;
let failed = 0;
let consoleErrors = [];

function check(name, condition, detail = '') {
    if (condition) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name} — ${detail}`); }
}

async function login(page, username, password, baseUrl = 'http://localhost:2000') {
    const base = baseUrl + '/admin/';
    await page.goto(base, { waitUntil: 'networkidle', timeout: 20000 });
    const inputs = await page.$$('input');
    if (inputs.length >= 2) {
        await inputs[0].fill(username);
        await inputs[1].fill(password);
        const submitBtn = await page.$('button[type="submit"]');
        if (submitBtn) await submitBtn.click();
        else await inputs[1].press('Enter');
        await page.waitForTimeout(3000);
    }
    return { success: !page.url().includes('login'), page };
}

async function clickNav(page, name) {
    const link = await page.$(`a:has-text("${name}")`);
    const btn = await page.$(`button:has-text("${name}")`);
    const el = link || btn;
    if (el) { await el.click(); await page.waitForTimeout(2000); return true; }
    return false;
}

function getResults() {
    return { passed, failed };
}

function resetCounters() {
    passed = 0;
    failed = 0;
}

function setupConsoleTracking(page) {
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`  ⚠️ Console error: ${msg.text().substring(0, 100)}`);
        }
    });
}

module.exports = { login, clickNav, check, getResults, resetCounters, setupConsoleTracking };
