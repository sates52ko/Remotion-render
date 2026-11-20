const fs = require('fs');
const d = JSON.parse(fs.readFileSync('production-gbs-dante.json', 'utf8'));
d.scenes.forEach((s, i) => console.log((i+1) + ': ' + s.text.substring(0, 50).replace(/\n/g, ' ')));
