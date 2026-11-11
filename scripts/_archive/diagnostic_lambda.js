const { getFunctions, getBuckets } = require('@remotion/lambda');
require('dotenv').config();

async function test() {
    try {
        console.log("Checking buckets in us-east-1...");
        const buckets = await getBuckets({
            region: 'us-east-1',
            accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY,
        });
        console.log("Buckets found:", buckets.map(b => b.name));
        
        console.log("Checking functions...");
        const functions = await getFunctions({
            region: 'us-east-1',
            accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY,
        });
        console.log("Functions found:", functions.map(f => f.functionName));
    } catch (e) {
        console.error("ERROR DETECTED:");
        console.error(e);
        process.exit(1);
    }
}

test();
