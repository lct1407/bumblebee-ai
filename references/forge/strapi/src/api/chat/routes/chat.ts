export default {
  routes: [
    {
      method: 'POST',
      path: '/chat',
      handler: 'chat.send',
      config: {
        policies: ['global::is-authenticated'],
      },
    },
  ],
};
