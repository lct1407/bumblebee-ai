/**
 * Agent session routes.
 * CRUD + command routes for agent chat sessions.
 * Auth: false + is-forge-project policy (JWT or API key).
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/agent-sessions',
      handler: 'agent-session.find',
      config: {
        auth: false,
        policies: ['global::is-forge-project'],
      },
    },
    {
      method: 'GET',
      path: '/agent-sessions/:id',
      handler: 'agent-session.findOne',
      config: {
        auth: false,
        policies: ['global::is-forge-project'],
      },
    },
    {
      method: 'POST',
      path: '/agent-sessions/start',
      handler: 'agent-session.start',
      config: {
        auth: false,
        policies: ['global::is-forge-project'],
      },
    },
    {
      method: 'POST',
      path: '/agent-sessions/send',
      handler: 'agent-session.send',
      config: {
        auth: false,
        policies: ['global::is-forge-project'],
      },
    },
    {
      method: 'POST',
      path: '/agent-sessions/abort',
      handler: 'agent-session.abort',
      config: {
        auth: false,
        policies: ['global::is-forge-project'],
      },
    },
    {
      method: 'POST',
      path: '/agent-sessions/:id/relay',
      handler: 'agent-session.relay',
      config: {
        auth: false,
        policies: ['global::is-forge-project'],
      },
    },
    {
      method: 'POST',
      path: '/agent-sessions/build-prompt',
      handler: 'agent-session.buildPrompt',
      config: {
        auth: false,
        policies: ['global::is-forge-project'],
      },
    },
    {
      method: 'POST',
      path: '/agent-sessions/prompt-built',
      handler: 'agent-session.promptBuilt',
      config: {
        auth: false,
        policies: ['global::is-forge-project'],
      },
    },
    {
      method: 'POST',
      path: '/agent-sessions/desktop/register',
      handler: 'agent-session.registerDesktop',
      config: {
        auth: false,
        policies: ['global::is-forge-project'],
      },
    },
    {
      method: 'POST',
      path: '/agent-sessions/desktop/unregister',
      handler: 'agent-session.unregisterDesktop',
      config: {
        auth: false,
        policies: ['global::is-forge-project'],
      },
    },
    {
      method: 'GET',
      path: '/agent-sessions/desktop/status',
      handler: 'agent-session.desktopStatus',
      config: {
        auth: false,
        policies: ['global::is-forge-project'],
      },
    },
    {
      method: 'DELETE',
      path: '/agent-sessions/:id',
      handler: 'agent-session.delete',
      config: {
        policies: ['global::is-authenticated'],
      },
    },
  ],
};
