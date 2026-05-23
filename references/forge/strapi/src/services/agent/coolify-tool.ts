import type { ForgeTool } from './tools';

interface CoolifyResource {
  name: string;
  uuid: string;
}

export const forgeCoolifyDeploy: ForgeTool = {
  name: 'forge_coolify_deploy',
  description:
    'Deploy project services via Coolify. Use "list" to see configured resources. Use "deploy" to trigger deployment (specify uuid or name, or omit to deploy all). Use "status" to check recent deployments for a resource.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'deploy', 'status'],
        description: 'The action to perform',
      },
      uuid: {
        type: 'string',
        description: 'Resource UUID to deploy/check. Can also pass the resource name.',
      },
      force: {
        type: 'boolean',
        description: 'Force rebuild without cache (deploy action only)',
      },
    },
    required: ['action'],
  },
  async execute(input, ctx) {
    const action = input.action as string;

    const project = await ctx.strapi.documents('api::project.project').findOne({
      documentId: ctx.projectDocumentId,
      fields: ['coolifyUrl', 'coolifyApiKey', 'coolifyResources'],
    });

    if (!project) return 'Error: project not found';

    const { coolifyUrl, coolifyApiKey } = project as {
      coolifyUrl?: string;
      coolifyApiKey?: string;
    };
    const resources = ((project as any).coolifyResources ?? []) as CoolifyResource[];

    if (!coolifyUrl || !coolifyApiKey) {
      return 'Error: Coolify not configured. Set coolifyUrl and coolifyApiKey in project settings.';
    }
    if (resources.length === 0) {
      return 'Error: No Coolify resources configured. Add resources in project settings.';
    }

    const baseUrl = coolifyUrl.replace(/\/+$/, '');
    const headers = {
      Authorization: `Bearer ${coolifyApiKey}`,
      Accept: 'application/json',
    };

    if (action === 'list') {
      return JSON.stringify(resources);
    }

    // Resolve which resource(s) to target
    const resolveTargets = (): CoolifyResource[] => {
      const identifier = input.uuid as string | undefined;
      if (!identifier) return resources; // deploy all
      const match = resources.find(
        (r) => r.uuid === identifier || r.name.toLowerCase() === identifier.toLowerCase(),
      );
      return match ? [match] : [];
    };

    if (action === 'deploy') {
      const targets = resolveTargets();
      if (targets.length === 0) {
        return `Error: Resource not found. Available: ${resources.map((r) => `${r.name} (${r.uuid})`).join(', ')}`;
      }

      const uuids = targets.map((t) => t.uuid).join(',');
      const params = new URLSearchParams({ uuid: uuids });
      if (input.force) params.set('force', 'true');

      const res = await fetch(`${baseUrl}/api/v1/deploy?${params}`, {
        method: 'GET',
        headers,
        signal: ctx.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        return `Error: Coolify deploy failed (${res.status}): ${text}`;
      }

      const data = await res.json();
      return JSON.stringify(data);
    }

    if (action === 'status') {
      const targets = resolveTargets();
      if (targets.length === 0) {
        return `Error: Resource not found. Available: ${resources.map((r) => `${r.name} (${r.uuid})`).join(', ')}`;
      }

      const results: Record<string, any> = {};
      for (const target of targets) {
        const res = await fetch(`${baseUrl}/api/v1/deployments/${target.uuid}`, {
          method: 'GET',
          headers,
          signal: ctx.signal,
        });
        if (!res.ok) {
          results[target.name] = { error: `Failed (${res.status})` };
        } else {
          const deployments = await res.json() as any[];
          // Return only the 3 most recent deployments with essential fields
          results[target.name] = (Array.isArray(deployments) ? deployments : [deployments]).slice(0, 3).map((d: any) => ({
            status: d.status,
            created_at: d.created_at,
            commit_message: d.commit_message,
          }));
        }
      }
      return JSON.stringify(results);
    }

    return `Unknown action: ${action}`;
  },
};
