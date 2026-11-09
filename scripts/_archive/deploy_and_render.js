const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env
const envConfig = dotenv.parse(fs.readFileSync(path.join(__dirname, '.env')));
const env = { ...process.env, ...envConfig };

function run(cmd) {
    console.log(`\n> Running: ${cmd}`);
    execSync(cmd, { env, stdio: 'inherit' });
}

try {
    // 1. Deploy Functions (2GB, 900s)
    run('npx remotion lambda functions deploy --memory=2048 --timeout=900 --region=us-east-1');

    // 2. Create Site (Dante V4)
    run('npx remotion lambda sites create src/index.ts --site-name=dante-gbs-v4 --region=us-east-1');

    // 3. Render
    run('npx remotion lambda render dante-gbs-v4 Dante-GBS --region=us-east-1');
} catch (error) {
    console.error("\nFAILED:", error.message);
}
