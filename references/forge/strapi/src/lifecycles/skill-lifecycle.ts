export function subscribeSkillLifecycles(strapi: any) {
  strapi.db.lifecycles.subscribe({
    models: ['api::skill.skill'],

    async beforeUpdate(event: any) {
      const { data, where } = event.params;

      // Auto-increment patch version on every update (unless version is explicitly set)
      if (!data.version) {
        const existing = await strapi.db.query('api::skill.skill').findOne({ where });
        if (existing?.version) {
          const parts = existing.version.split('.').map(Number);
          parts[2] = (parts[2] || 0) + 1;
          data.version = parts.join('.');
        }
      }
    },
  });
}
