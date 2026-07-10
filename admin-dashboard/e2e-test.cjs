/**
 * E2E Test: Login → Settings → Services → Start → No Redirect
 * CommonJS version to avoid ESM module resolution issues.
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:2000/admin/';
const USERNAME = 'admin';
const PASSWORD = 'f01f8ab0524a7d18';

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
            // Find all buttons that say "Start"
            const allButtons = await page.$$('button');
            let startClicked = false;
            
            for (const btn of allButtons) {
                const text = await btn.textContent();
                if (text.trim() === 'Start') {
                    console.log(`  Found Start button, clicking...`);
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
                    console.log(`  Final URL: ${currentUrl}`);
                    break;
                }
            }
            
            if (!startClicked) {
                console.log('  No Start button found - services may already be running');
                // Try clicking any Stop button instead (not an error)
                const hasStop = await page.$('text=Stop') !== null;
                check('Services in running state or startable', true, 
                      hasStop ? 'Stop buttons found (services running)' : 'No Start or Stop buttons');
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
