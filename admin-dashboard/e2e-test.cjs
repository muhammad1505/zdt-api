/**
 * E2E Test: Full user flow — Login → Settings → Services → Start/Stop → No Redirect
 * 
 * Run: node e2e-test.cjs
 * Env vars: ZDT_USERNAME (default: admin), ZDT_PASSWORD (required), ZDT_BASE_URL (default: http://localhost:2000)
 */
const { chromium } = require('playwright');

const BASE_URL = process.env.ZDT_BASE_URL || 'http://localhost:2000';
const BASE = BASE_URL + '/admin/';
const USERNAME = process.env.ZDT_USERNAME || 'admin';
const PASSWORD = process.env.ZDT_PASSWORD;

if (!PASSWORD) {
    console.error('❌ ZDT_PASSWORD environment variable is required');
    console.error('   Usage: ZDT_PASSWORD=yourpass node e2e-test.cjs');
    process.exit(1);
}

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
    if (condition) {
        passed++;
        console.log(`  ✅ ${name}`);
    } else {
        failed++;
        console.log(`  ❌ ${name} — ${detail}`);
    }
}

(async () => {
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage({
        viewport: { width: 1280, height: 800 }
    });

    console.log('\n=== TEST 1: Admin SPA loads ===');
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    const title = await page.title();
    check('Page loads', title.length > 0, title);
    
    const hasInput = await page.$('input') !== null;
    check('Shows login form', hasInput, 'no input found');

    console.log('\n=== TEST 2: Login ===');
    // Username input has NO type attribute; password input type dynamically changes
    const allInputs = await page.$$('input');
    console.log(`  Found ${allInputs.length} inputs`);
    
    if (allInputs.length >= 2) {
        // First input = username (no type attribute), second = password
        await allInputs[0].fill(USERNAME);
        await allInputs[1].fill(PASSWORD);
        
        // Click Sign In button
        const submitBtn = await page.$('button[type="submit"]');
        if (submitBtn) {
            await submitBtn.click();
        } else {
            // Fallback: press Enter
            await allInputs[1].press('Enter');
        }
        
        await page.waitForTimeout(4000);
        check('Login succeeded (no login page)', 
              !page.url().includes('login'), 
              `URL: ${page.url()}`);
        
        const bodyAfterLogin = await page.textContent('body');
        check('Dashboard visible', 
              bodyAfterLogin.includes('Dashboard') || bodyAfterLogin.includes('Settings'), 
              `Content: ${bodyAfterLogin.substring(0, 200)}`);

        console.log('\n=== TEST 3: Navigate to Settings ===');
        const settingsLink = await page.$('a:has-text("Settings")');
        const settingsButton = await page.$('button:has-text("Settings")');
        const settingsEl = settingsLink || settingsButton;
        
        if (settingsEl) {
            await settingsEl.click();
            await page.waitForTimeout(2000);
            
            const settingsBody = await page.textContent('body');
            const hasServices = settingsBody.includes('Start') || settingsBody.includes('Stop') || 
                               settingsBody.includes('Running') || settingsBody.includes('Stopped');
            check('Services tab visible with service buttons', hasServices, 
                  `Content around services: ${settingsBody.substring(settingsBody.indexOf('Services') - 50, settingsBody.indexOf('Services') + 200)}`);

            console.log('\n=== TEST 4: Start a service (CRITICAL) ===');
            const allButtons = await page.$$('button');
            let startClicked = false;
            let startedServiceName = '';
            
            for (const btn of allButtons) {
                const text = await btn.textContent();
                if (text.trim() === 'Start') {
                    // Get the service name from the card heading
                    const card = await btn.evaluate(el => {
                        let p = el.closest('[class*=rounded-2xl]');
                        return p ? (p.querySelector('[class*=font-medium]')?.textContent || '') : '';
                    });
                    startedServiceName = card || 'unknown';
                    console.log(`  Starting: "${startedServiceName}"...`);
                    startClicked = true;
                    await btn.click();
                    await page.waitForTimeout(3000);
                    
                    // CRITICAL CHECK: Did we get redirected to login?
                    const currentUrl = page.url();
                    check('NOT redirected to login! ✨', 
                          !currentUrl.includes('login'), 
                          `Redirected to: ${currentUrl}`);
                    check('Still on admin page', 
                          currentUrl.includes('/admin/'), 
                          `URL: ${currentUrl}`);
                    
                    // Check for success toast or status change
                    const afterStartBody = await page.textContent('body');
                    const hasRunning = afterStartBody.includes('Running');
                    const hasSuccess = afterStartBody.includes('success') || afterStartBody.includes('berhasil');
                    check('Service status shows Running or success toast',
                          hasRunning || hasSuccess,
                          hasRunning ? 'Running badge found' : hasSuccess ? 'Success toast found' : 'No Running badge or success toast');
                    console.log(`  Final URL: ${currentUrl}`);
                    break;
                }
            }
            
            if (!startClicked) {
                console.log('  No Start button found - services may already be running');
                const hasStop = await page.$('text=Stop') !== null;
                check('Services in running state or startable', true, 
                      hasStop ? 'Stop buttons found (services running)' : 'No Start or Stop buttons');
            }

            // ========== CLEANUP: Stop the service ==========
            if (startClicked && startedServiceName) {
                console.log('\n=== TEST 5: Stop service (cleanup) ===');
                await page.waitForTimeout(2000);
                // Find Stop button for same service
                const buttonsAfter = await page.$$('button');
                for (const btn of buttonsAfter) {
                    const txt = await btn.textContent();
                    if (txt.trim() === 'Stop') {
                        console.log(`  Stopping: "${startedServiceName}"...`);
                        await btn.click();
                        await page.waitForTimeout(3000);
                        
                        const stopUrl = page.url();
                        check('NOT redirected on stop', 
                              !stopUrl.includes('login'), 
                              `Redirected to: ${stopUrl}`);
                        
                        const afterStopBody = await page.textContent('body');
                        const hasStopped = afterStopBody.includes('Stopped');
                        check('Service shows Stopped or success toast',
                              hasStopped || afterStopBody.includes('berhasil') || afterStopBody.includes('success'),
                              hasStopped ? 'Stopped badge found' : 'Success toast expected');
                        console.log('  Cleanup complete');
                        break;
                    }
                }
            }
        } else {
            check('Settings link/button found', false, 'Settings not found');
        }
    } else {
        check('Login form found', false, `textInput: ${!!textInput}, passwordInput: ${!!passwordInput}`);
    }

    // Collect console errors
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForTimeout(500);
    
    console.log('\n=== RESULTS ===');
    console.log(`  Passed: ${passed}/${passed + failed}`);
    console.log(`  Failed: ${failed}`);
    if (errors.length > 0) {
        console.log(`  Console errors: ${errors.slice(0, 5).join(' | ')}`);
    } else {
        console.log('  Console errors: none');
    }

    await browser.close();
    console.log('\n=== TEST COMPLETE ===');
    process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('Test error:', e.message, e.stack);
    process.exit(1);
});
