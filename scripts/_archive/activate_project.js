const fs = require('fs');
const path = require('path');

const projectName = process.argv[2];

if (!projectName) {
  console.error('Usage: node scripts/activate_project.js <project-json-filename>');
  console.log('Example: node scripts/activate_project.js production-single-dad-dilemma.json');
  process.exit(1);
}

const sourcePath = path.resolve(projectName);
const destPath = path.resolve('project-config.json');

if (!fs.existsSync(sourcePath)) {
  console.error(`Error: File ${projectName} not found.`);
  process.exit(1);
}

try {
  const config = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  
  // Ensure we have a compositionId
  if (!config.compositionId) {
    // Generate one if missing
    config.compositionId = projectName.replace('.json', '').replace('production-', '');
  }

  fs.writeFileSync(destPath, JSON.stringify(config, null, 2));
  console.log(`Successfully activated project: ${config.compositionId}`);
  console.log(`Configuration saved to project-config.json`);
} catch (err) {
  console.error(`Failed to activate project: ${err.message}`);
  process.exit(1);
}
