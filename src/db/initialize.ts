import { ConvexHttpClient } from 'convex/browser';

export const convex = new ConvexHttpClient(import.meta.env.PUBLIC_CONVEX_URL);
