// Lessons learned capture hook
// Triggers when user wants to remember something
const TIMEOUT_MS = 5000;

let input = '';
let completed = false;

function respond(additionalContext) {
  if (completed) return;
  completed = true;
  if (additionalContext) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext
      }
    }));
  }
  process.exit(0);
}

// Timeout protection
const timeout = setTimeout(() => {
  respond();
}, TIMEOUT_MS);

// Handle stdin errors
process.stdin.on('error', () => {
  clearTimeout(timeout);
  respond();
});

process.stdin.on('data', chunk => {
  input += chunk;
});

process.stdin.on('end', () => {
  clearTimeout(timeout);

  try {
    if (!input.trim()) {
      respond();
      return;
    }

    const data = JSON.parse(input);
    const prompt = (data.prompt || '').toLowerCase();

    const triggers = [
      'remember', 'learned', 'lesson', 'note this',
      'don\'t forget', 'keep in mind', 'important:',
      'takeaway', 'insight'
    ];

    const shouldCapture = triggers.some(t => prompt.includes(t));

    if (shouldCapture) {
      const today = new Date().toISOString().split('T')[0];
      respond(`## Lesson Capture Requested\nUser wants to save a lesson/insight. After addressing their request:\n\n1. Append to .claude/lessons-learned.md with format:\n---\n## ${today} - [Topic]\n**Context:** [Brief context]\n**Lesson:** [What was learned]\n**Action:** [How to apply it]\n---\n\n2. Confirm the lesson was saved.`);
    } else {
      respond();
    }
  } catch (e) {
    // Silently continue on parse errors
    respond();
  }
});
