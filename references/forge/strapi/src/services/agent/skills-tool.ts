import type { ForgeTool } from './tools';

export const forgeSkills: ForgeTool = {
  name: 'forge_skills',
  description:
    'Manage and sync Claude Code skills. Use "list" to see available skills with versions. Use "get" to fetch a full skill including all files. Use "check" to get skill versions for comparing against local copies. Use "push" to upload/update a skill to Strapi. Use "add-files" to add files to an existing skill in batches (merges with existing files — use this for large skills with many files).',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get', 'check', 'push', 'add-files'],
        description: 'The action to perform',
      },
      name: {
        type: 'string',
        description: 'Skill name (for get, add-files actions)',
      },
      data: {
        type: 'object',
        description:
          'For push: name (required), description, skillMd (required), files (array of {path, content, encoding}), isGlobal (boolean). For add-files: files (required, array of {path, content, encoding}) — merged into existing files by path.',
      },
    },
    required: ['action'],
  },
  async execute(input, ctx) {
    const action = input.action as string;
    const docs = ctx.strapi.documents('api::skill.skill' as any);

    if (action === 'list') {
      const skills = await docs.findMany({
        filters: {
          $or: [
            { project: { documentId: { $eq: ctx.projectDocumentId } } },
            { isGlobal: { $eq: true } },
          ],
        },
      });
      return JSON.stringify(
        (skills as any[]).map((s: any) => ({
          name: s.name,
          version: s.version,
          description: s.description,
          isGlobal: s.isGlobal,
          updatedAt: s.updatedAt,
        })),
      );
    }

    if (action === 'get') {
      const name = input.name as string;
      if (!name) return 'Error: name required for get action';
      const skills = await docs.findMany({
        filters: { name: { $eq: name } },
        limit: 1,
      });
      if (!(skills as any[]).length) return 'Skill not found';
      const s = (skills as any[])[0];
      return JSON.stringify({
        name: s.name,
        version: s.version,
        description: s.description,
        skillMd: s.skillMd,
        files: s.files || [],
      });
    }

    if (action === 'check') {
      const skills = await docs.findMany({
        filters: {
          $or: [
            { project: { documentId: { $eq: ctx.projectDocumentId } } },
            { isGlobal: { $eq: true } },
          ],
        },
      });
      return JSON.stringify(
        (skills as any[]).map((s: any) => ({
          name: s.name,
          version: s.version,
          updatedAt: s.updatedAt,
        })),
      );
    }

    if (action === 'push') {
      const data = input.data as Record<string, any>;
      if (!data?.name || !data?.skillMd) return 'Error: data.name and data.skillMd required for push';

      // Check if skill already exists — update it
      const existing = await docs.findMany({
        filters: { name: { $eq: data.name } },
        limit: 1,
      });

      if ((existing as any[]).length) {
        const skill = (existing as any[])[0];
        const updateData: Record<string, any> = {
          description: data.description || skill.description,
          skillMd: data.skillMd,
          files: data.files || skill.files,
          isGlobal: data.isGlobal ?? skill.isGlobal,
        };
        if (data.version) updateData.version = data.version;
        // version auto-incremented by lifecycle hook when not explicitly set
        const updated = await docs.update({
          documentId: skill.documentId,
          data: updateData,
        });
        return JSON.stringify({
          documentId: (updated as any).documentId,
          name: data.name,
          version: (updated as any).version,
          status: 'updated',
        });
      }

      // Create new skill
      const createData: Record<string, any> = {
        name: data.name,
        description: data.description || '',
        skillMd: data.skillMd,
        files: data.files || [],
        isGlobal: data.isGlobal ?? false,
        project: { documentId: ctx.projectDocumentId },
      };
      if (data.version) createData.version = data.version;
      const created = await docs.create({
        data: createData,
      });
      return JSON.stringify({
        documentId: (created as any).documentId,
        name: data.name,
        version: (created as any).version,
        status: 'created',
      });
    }

    if (action === 'add-files') {
      const name = input.name as string;
      const data = input.data as Record<string, any>;
      if (!name) return 'Error: name required for add-files action';
      if (!data?.files?.length) return 'Error: data.files array required for add-files action';

      const skills = await docs.findMany({
        filters: { name: { $eq: name } },
        limit: 1,
      });
      if (!(skills as any[]).length) return `Skill "${name}" not found`;

      const skill = (skills as any[])[0];
      const existingFiles: any[] = skill.files || [];
      const newFiles: any[] = data.files;

      // Merge: new files overwrite existing by path, others are kept
      const fileMap = new Map<string, any>();
      for (const f of existingFiles) fileMap.set(f.path, f);
      for (const f of newFiles) fileMap.set(f.path, f);
      const mergedFiles = Array.from(fileMap.values());

      const updated = await docs.update({
        documentId: skill.documentId,
        data: { files: mergedFiles },
      });

      return JSON.stringify({
        documentId: (updated as any).documentId,
        name,
        version: (updated as any).version,
        fileCount: mergedFiles.length,
        added: newFiles.length,
        status: 'files_added',
      });
    }

    return `Unknown action: ${action}`;
  },
};
