import type { APIRoute } from 'astro';
import { getWorkerCatalog } from '../cart/catalog';

// dist/catalog.json (spec 6.2): prices, stock and shipping for the Worker.
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await getWorkerCatalog(), null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
