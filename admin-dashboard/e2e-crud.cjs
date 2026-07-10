/**
 * E2E Full CRUD Test: Create/Delete user, Generate API Key
 * Env vars: ZDT_USERNAME, ZDT_PASSWORD, ZDT_BASE_URL
 */
const { chromium } = require('playwright');
const { login: sharedLogin, clickNav, check, getResults } = require('./e2e-helpers.cjs');

const BASE_URL = process.env.ZDT_BASE_URL || 'http://localhost:2000';
const USERNAME = process.env.ZDT_USERNAME || 'admin';
const PASSWORD = process.env.ZDT_PASSWORD;
if (!PASSWORD) { console.error('ZDT_PASSWORD required'); process.exit(1); }

const TS = Date.now();

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    console.log('\n=== LOGIN ===');
    const loginOk = (await sharedLogin(page, USERNAME, PASSWORD, BASE_URL)).success;
    check('Login success', loginOk, '');
    if (!loginOk) { await browser.close(); process.exit(1); }

    // ========== CREATE USER ==========
    console.log('\n=== CREATE USER ===');
    await clickNav(page, 'Users');
    await page.waitForTimeout(1000);

    const addBtn = await page.$('button:has-text("Add User")');
    check('Add User button visible', addBtn !== null, '');
    
    if (addBtn) {
        await addBtn.click();
        await page.waitForTimeout(1000);

        const modalInputs = await page.$$('input');
        if (modalInputs.length >= 3) {
            await modalInputs[0].fill('e2euser_' + TS);
            await modalInputs[1].fill('testpass_' + TS);
            await modalInputs[2].fill('E2E Test User');

            const createBtn = await page.$('button:has-text("Create")');
            if (createBtn) {
                await createBtn.click();
                await page.waitForTimeout(2000);
                const body = await page.textContent('body');
                check('User created', body.includes('e2euser_' + TS), 'Username not found');
            }
        }
    }

    // ========== DELETE USER ==========
    console.log('\n=== DELETE USER ===');
    await page.waitForTimeout(1000);
    
    let dialogAccepted = false;
    const delHandler = async dialog => {
        dialogAccepted = true;
        await dialog.accept();
    };
    page.once('dialog', delHandler);

    const delBtn = await page.$('button.bg-error-50');
    if (delBtn) {
        await delBtn.click();
        await page.waitForTimeout(2000);
        check('Delete dialog handled', dialogAccepted, 'Dialog was not triggered');
    } else {
        check('Delete button found', false, 'No delete button found');
    }

    // ========== GENERATE API KEY ==========
    console.log('\n=== GENERATE API KEY ===');
    await clickNav(page, 'API Keys');
    await page.waitForTimeout(1500);

    const genBtn = await page.$('button:has-text("Generate Key")');
    check('Generate Key button visible', genBtn !== null, '');
    
    if (genBtn) {
        await genBtn.click();
        await page.waitForTimeout(1500);

        const labelInput = await page.$('input[placeholder*="e.g."]');
        if (labelInput) {
            await labelInput.fill('');
            await labelInput.fill('E2E Key ' + TS);
        }

        await page.waitForTimeout(500);
        // Use exact match: only the modal's Generate button, not the page's Generate Key button
        const generateBtn = await page.$('div.fixed.inset-0 button:has-text("Generate"):not(:has-text("Key"))');
        if (generateBtn) {
            await generateBtn.click({ force: true });
            await page.waitForTimeout(2000);
            const body = await page.textContent('body');
            check('Key generated', body.includes('New Key') || body.includes('smart_key'), '');
        } else {
            check('Generate button found', false, 'Modal not visible');
        }
    }

    // ========== REVOKE GENERATED KEY ==========
    console.log('\n=== REVOKE API KEY ===');
    await page.waitForTimeout(1000);
    
    let dialog2Accepted = false;
    const revokeHandler = async dialog => {
        dialog2Accepted = true;
        await dialog.accept();
    };
    page.once('dialog', revokeHandler);

    const revokeBtn = await page.$('button.bg-error-50');
    if (revokeBtn) {
        await revokeBtn.click();
        await page.waitForTimeout(2000);
        check('Revoke dialog handled', dialog2Accepted, 'Revoke dialog not triggered');
        
        const bodyAfter = await page.textContent('body');
        check('Key shows Revoked', bodyAfter.includes('Revoked'), 'Key still shows Active');
    } else {
        check('Revoke button found', false, 'No bg-error-50 button on API Keys page');
    }

    console.log('\n=== RESULTS ===');
    const r = getResults();
    console.log('  Passed: ' + r.passed + '/' + (r.passed + r.failed));
    console.log('  Failed: ' + r.failed);
    await browser.close();
    process.exit(r.failed > 0 ? 1 : 0);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
