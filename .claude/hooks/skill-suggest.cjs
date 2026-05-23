// Skill suggestion hook - suggests relevant skills based on user prompt
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

    // Skill mappings: keyword patterns -> skill name and description
    const skillMappings = [
      {
        patterns: ['test', 'coverage', 'jest', 'run test', 'check test'],
        skill: 'tester',
        desc: 'Run tests, check coverage, generate test files'
      },
      {
        patterns: ['strapi', 'backend', 'api module', 'controller', 'service', 'schema'],
        skill: 'strapi',
        desc: 'Strapi backend development patterns'
      },
      {
        patterns: ['start server', 'stop server', 'strapi server', 'dev server'],
        skill: 'strapi-server',
        desc: 'Start/stop Strapi development server'
      },
      {
        patterns: ['next', 'frontend', 'react', 'page', 'component', 'feature module'],
        skill: 'nextjs',
        desc: 'Next.js App Router development patterns'
      },
      {
        patterns: ['integration', 'connect', 'api client', 'frontend types', 'type generation'],
        skill: 'integration',
        desc: 'Strapi + Next.js integration, type generation'
      },
      {
        patterns: ['design', 'ui', 'visual', 'screenshot', 'mockup', 'interface'],
        skill: 'frontend-design',
        desc: 'Create production-grade frontend interfaces'
      },
      {
        patterns: ['create skill', 'new skill', 'skill template'],
        skill: 'skill-creator',
        desc: 'Create new skills for Claude Code'
      },
      {
        patterns: ['lesson', 'learned', 'remember', 'standard', 'coding rule'],
        skill: 'lessons-learned',
        desc: 'Add technical insights to coding standards'
      }
    ];

    const suggestions = [];
    for (const mapping of skillMappings) {
      if (mapping.patterns.some(p => prompt.includes(p))) {
        suggestions.push(`- **${mapping.skill}**: ${mapping.desc}`);
      }
    }

    if (suggestions.length > 0) {
      respond(`## Available Skills\nConsider using these skills for this task:\n${suggestions.join('\n')}\n\nInvoke with: /skill-name or use Skill tool`);
    } else {
      respond();
    }
  } catch (e) {
    // Silently continue on parse errors
    respond();
  }
});
