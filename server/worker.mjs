import { handleRequest } from './api.mjs';
import { fileStore } from './storage.mjs';
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/'))
      return handleRequest(request, { ...env, BUCKET: fileStore(env.DB) });
    return env.ASSETS.fetch(request);
  },
};
