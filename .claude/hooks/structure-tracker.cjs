#!/usr/bin/env node
// Project structure tracker hook
// Runs PostToolUse on Write to remind about updating structure docs

const TIMEOUT_MS = 3000;

let input = '';
let completed = false;

function respond(result, message) {
  if (completed) return;
  completed = true;
  try {
    const response = message ? { result, message } : { result };
    console.log(JSON.stringify(response));
  } catch (e) {
    console.log('{"result":"continue"}');
  }
  process.exit(0);
}

// Global error handlers - always continue on error
process.on('uncaughtException', () => respond('continue'));
process.on('unhandledRejection', () => respond('continue'));

// Timeout protection
const timeout = setTimeout(() => respond('continue'), TIMEOUT_MS);

// Handle stdin errors
process.stdin.on('error', () => {
  clearTimeout(timeout);
  respond('continue');
});

process.stdin.on('data', chunk => {
  input += chunk;
});

process.stdin.on('end', () => {
  clearTimeout(timeout);

  try {
    if (!input.trim()) {
      respond('continue');
      return;
    }

    const data = JSON.parse(input);
    const filePath = data.tool_input?.file_path || '';

    // Only trigger for significant new files
    const significantPaths = [
      '/features/',
      '/components/',
      '/app/',
      '/api/',
      '/lib/',
      '/hooks/',
      '/providers/'
    ];

    const isSignificant = significantPaths.some(p => filePath.includes(p));

    if (isSignificant) {
      respond('continue', `<system-reminder>New file: ${filePath.split('/').pop()}. Update docs/project-structure.md if structure changed.</system-reminder>`);
    } else {
      respond('continue');
    }
  } catch (e) {
    respond('continue');
  }
});
