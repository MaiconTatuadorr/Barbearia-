import app from '../../lib/app.js';

export const onRequest = (context) => app.fetch(context.request, context.env, context);
