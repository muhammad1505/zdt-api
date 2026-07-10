#!/usr/bin/env node
/**
 * E2E All Tests Runner
 * Runs all E2E tests in sequence with one command.
 * 
 * Usage: ZDT_PASSWORD=yourpass node e2e-all.cjs
 */
const { execSync } = require('child_process');

const PASSWORD = process.env.ZDT_PASSWORD;
if (!PASSWORD) {
    console.error('ZDT_PASSWORD environment variable is required');
    process.exit(1);
}

const TESTS = [
    { name: 'Services (Start/Stop/No Redirect)', file: 'e2e-test.cjs' },
    { name: 'Features (Files, VPN, Tools, Logs)', file: 'e2e-features.cjs' },
    { name: 'Admin (Users & API Keys pages)', file: 'e2e-admin.cjs' },
    { name: 'CRUD (Create/Delete user, Generate/Revoke key)', file: 'e2e-crud.cjs' },
];

let totalPassed = 0;
let totalFailed = 0;
let allResults = [];

console.log('\n' + '='.repeat(50));
console.log('  ZDT E2E All Tests Runner');
console.log('='.repeat(50) + '\n');

for (const test of TESTS) {
    console.log('─'.repeat(40));
    console.log(`  Running: ${test.name}`);
    console.log('─'.repeat(40));
    
    try {
        const output = execSync(`ZDT_PASSWORD="${PASSWORD}" node ${test.file}`, {
            cwd: __dirname,
            timeout: 120000,
            encoding: 'utf-8'
        });
        
        // Extract results from output
        const passMatch = output.match(/Passed:\s*(\d+)/);
        const failMatch = output.match(/Failed:\s*(\d+)/);
        const passed = passMatch ? parseInt(passMatch[1]) : 0;
        const failed = failMatch ? parseInt(failMatch[1]) : 0;
        
        totalPassed += passed;
        totalFailed += failed;
        allResults.push({ name: test.name, passed, failed, status: failed === 0 ? '✅' : '❌' });
        
        console.log(`  Status: ${failed === 0 ? '✅ PASSED' : '❌ FAILED'} (${passed}/${passed + failed})`);
    } catch (e) {
        totalFailed += 1;
        allResults.push({ name: test.name, passed: 0, failed: 1, status: '❌' });
        console.log(`  Status: ❌ CRASHED - ${e.message.substring(0, 100)}`);
    }
    console.log('');
}

console.log('='.repeat(50));
console.log('  RESULTS SUMMARY');
console.log('='.repeat(50));
for (const r of allResults) {
    console.log(`  ${r.status} ${r.name}: ${r.passed}/${r.passed + r.failed}`);
}
console.log('');
console.log(`  TOTAL: ${totalPassed}/${totalPassed + totalFailed} passed`);
console.log(`  ${totalFailed === 0 ? '✅ ALL TESTS PASSED!' : '❌ SOME TESTS FAILED!'}`);
console.log('='.repeat(50));

process.exit(totalFailed > 0 ? 1 : 0);
