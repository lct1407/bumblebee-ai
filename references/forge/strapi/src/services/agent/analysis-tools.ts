import { exec } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ForgeTool, ForgeToolContext } from './tools';

export function createChartTool(chartsDir: string, publicUrl: string): ForgeTool {
  return {
    name: 'chart_generate',
    description:
      'Generate a chart image from a Chart.js configuration object. Returns the image URL. Supported: bar, line, pie, doughnut, radar, polarArea, scatter, bubble.',
    parameters: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Chart.js configuration object with type, data, and optional options',
        },
        title: { type: 'string', description: 'Chart title (used for filename)' },
        width: { type: 'number', description: 'Image width in pixels (default 800)' },
        height: { type: 'number', description: 'Image height in pixels (default 400)' },
      },
      required: ['config'],
    },
    async execute(input) {
      const config = input.config as Record<string, unknown>;
      const title = (input.title as string) ?? 'chart';
      const width = (input.width as number) ?? 800;
      const height = (input.height as number) ?? 400;

      await mkdir(chartsDir, { recursive: true });

      const filename = `${title.replace(/[^a-zA-Z0-9-_]/g, '_')}_${Date.now()}.png`;
      const filepath = join(chartsDir, filename);

      const { ChartJSNodeCanvas } = await import('chartjs-node-canvas' as string) as any;
      const chartCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });
      const buffer = await chartCanvas.renderToBuffer(config as any);
      await writeFile(filepath, buffer);

      return `Chart saved to: ${filepath}\nURL: ${publicUrl}/charts/${filename}`;
    },
  };
}

export function createCodeRunTool(sandboxDir: string): ForgeTool {
  return {
    name: 'code_run',
    description:
      'Execute Python or JavaScript code in a subprocess (30s timeout). Use for data analysis, aggregations, or computation. Print results to stdout.',
    parameters: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['python', 'javascript'],
          description: 'Programming language',
        },
        code: { type: 'string', description: 'Code to execute. Print results to stdout.' },
        data: { type: 'string', description: 'Optional data to pass as stdin' },
      },
      required: ['language', 'code'],
    },
    async execute(input, ctx) {
      if (process.env.FORGE_AGENT_CODE_EXECUTION !== 'true') {
        return 'Error: Code execution is disabled. Set FORGE_AGENT_CODE_EXECUTION=true to enable.';
      }

      const language = input.language as string;
      const code = input.code as string;
      const data = input.data as string | undefined;

      await mkdir(sandboxDir, { recursive: true });

      const id = randomUUID().slice(0, 8);
      const ext = language === 'python' ? 'py' : 'js';
      const scriptPath = join(sandboxDir, `script_${id}.${ext}`);

      await writeFile(scriptPath, code, 'utf-8');

      const cmd = language === 'python' ? `python3 "${scriptPath}"` : `node "${scriptPath}"`;

      return new Promise<string>((resolve) => {
        const child = exec(
          cmd,
          {
            timeout: 30_000,
            maxBuffer: 1024 * 1024 * 5,
            cwd: sandboxDir,
            signal: ctx.signal,
          },
          (error, stdout, stderr) => {
            const output = (stdout ?? '').trim();
            const errors = (stderr ?? '').trim();

            if (error && !output && !errors) {
              resolve(`Error: ${error.message}`);
            } else if (errors && !output) {
              resolve(`Error:\n${errors.slice(0, 5000)}`);
            } else if (errors) {
              resolve(`${output}\n\nWarnings:\n${errors}`.slice(0, 30000));
            } else {
              resolve(output || '(no output)');
            }
          },
        );

        if (data && child.stdin) {
          child.stdin.write(data);
          child.stdin.end();
        }
      });
    },
  };
}
