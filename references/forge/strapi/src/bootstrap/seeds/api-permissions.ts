/**
 * API permissions seed for the Authenticated role.
 * Grants CRUD on all Forge content types to authenticated users.
 *
 * When adding a new controller action:
 * 1. Create the route in routes/
 * 2. Create the handler in controllers/
 * 3. Add the action here
 */

/** Plugin permissions for the Authenticated role (e.g. file uploads). */
export const pluginPermissions = [
  'plugin::upload.content-api.upload',
  'plugin::upload.content-api.find',
  'plugin::upload.content-api.findOne',
  'plugin::upload.content-api.destroy',
];

export const apiPermissions = [
  { controller: 'project', actions: ['find', 'findOne', 'create', 'update', 'delete'] },
  { controller: 'issue', actions: ['find', 'findOne', 'create', 'update', 'delete'] },
  { controller: 'task', actions: ['find', 'findOne', 'create', 'update', 'delete'] },
  { controller: 'comment', actions: ['find', 'findOne', 'create', 'update', 'delete'] },
  { controller: 'chat-session', actions: ['find', 'findOne', 'create', 'update', 'delete'] },
  { controller: 'chat', actions: ['send'] },
  { controller: 'memory', actions: ['find', 'findOne', 'create', 'update', 'delete'] },
  { controller: 'agent', actions: ['find', 'findOne', 'create', 'update', 'delete'] },
  { controller: 'agent-definition', actions: ['find', 'findOne', 'create', 'update', 'delete'] },
  { controller: 'notification', actions: ['find', 'findOne', 'update', 'delete', 'markAllRead', 'unreadCount'] },
  { controller: 'skill', actions: ['find', 'findOne', 'create', 'update', 'delete'] },
];

export async function seedApiPermissions(strapi) {
  const authenticatedRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'authenticated' } });

  if (!authenticatedRole) {
    strapi.log.warn('Authenticated role not found, skipping permission seed');
    return;
  }

  let seeded = 0;

  for (const { controller, actions } of apiPermissions) {
    for (const action of actions) {
      const actionId = `api::${controller}.${controller}.${action}`;

      const existing = await strapi.db
        .query('plugin::users-permissions.permission')
        .findOne({
          where: {
            action: actionId,
            role: authenticatedRole.id,
          },
        });

      if (!existing) {
        await strapi.db.query('plugin::users-permissions.permission').create({
          data: {
            action: actionId,
            role: authenticatedRole.id,
            enabled: true,
          },
        });
        seeded++;
      }
    }
  }

  // Seed plugin permissions (uploads, etc.)
  for (const action of pluginPermissions) {
    const existing = await strapi.db
      .query('plugin::users-permissions.permission')
      .findOne({
        where: {
          action,
          role: authenticatedRole.id,
        },
      });

    if (!existing) {
      await strapi.db.query('plugin::users-permissions.permission').create({
        data: {
          action,
          role: authenticatedRole.id,
          enabled: true,
        },
      });
      seeded++;
    }
  }

  if (seeded > 0) {
    strapi.log.info(`Seeded ${seeded} API permissions for Authenticated role`);
  }
}
