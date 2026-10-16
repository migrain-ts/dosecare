import { z, type ZodType } from 'zod';
import * as S from '@dosecare/shared';

type Doc = { summary: string; body?: ZodType; query?: ZodType };

export const ROUTE_DOCS: Record<string, Doc> = {
  'POST /auth/register': { summary: 'Create an account and sign in', body: S.registerSchema },
  'POST /auth/login': { summary: 'Sign in', body: S.loginSchema },
  'POST /auth/logout': { summary: 'Sign out' },
  'GET /auth/me': { summary: 'Current user' },
  'GET /recipients': { summary: 'List the people I follow' },
  'POST /recipients': { summary: 'Add a person to follow', body: S.recipientCreateSchema },
  'GET /recipients/:id': { summary: 'Get a person' },
  'PATCH /recipients/:id': { summary: 'Update a person (owner)', body: S.recipientUpdateSchema },
  'DELETE /recipients/:id': { summary: 'Delete a person (owner)' },
  'GET /recipients/:id/members': { summary: 'List members' },
  'PATCH /recipients/:id/members/:userId': { summary: 'Change a member role (owner)', body: S.memberUpdateSchema },
  'DELETE /recipients/:id/members/:userId': { summary: 'Remove a member (owner)' },
  'POST /recipients/:id/invitations': { summary: 'Invite someone by email (owner)', body: S.invitationCreateSchema },
  'GET /recipients/:id/invitations': { summary: 'List pending invitations (owner)' },
  'DELETE /recipients/:id/invitations/:invitationId': { summary: 'Revoke an invitation (owner)' },
  'POST /invitations/:token/accept': { summary: 'Accept an invitation' },
  'GET /recipients/:id/medications': { summary: 'List medications with schedules and stock' },
  'POST /recipients/:id/medications': { summary: 'Add a medication (editor)', body: S.medicationCreateSchema },
  'GET /medications/:id': { summary: 'Get a medication' },
  'PATCH /medications/:id': { summary: 'Update a medication (editor)', body: S.medicationUpdateSchema },
  'DELETE /medications/:id': { summary: 'Archive a medication (editor)' },
  'POST /medications/:id/schedules': { summary: 'Add a schedule (editor)', body: S.scheduleInputSchema },
  'PUT /schedules/:id': { summary: 'Replace a schedule (editor)', body: S.scheduleInputSchema },
  'DELETE /schedules/:id': { summary: 'Delete a schedule (editor)' },
  'GET /medications/:id/stock': { summary: 'Remaining stock and days left' },
  'POST /medications/:id/stock-movements': { summary: 'Record a refill or adjustment (editor)', body: S.stockMovementSchema },
  'GET /recipients/:id/doses': { summary: 'List doses in a local date range (max 31 days)', query: S.doseQuerySchema },
  'POST /doses/:id/take': { summary: 'Record a dose as taken (editor)' },
  'POST /doses/:id/skip': { summary: 'Record a dose as skipped (editor)' },
  'GET /recipients/:id/preferences': { summary: 'My notification preferences' },
  'PUT /recipients/:id/preferences': { summary: 'Update my notification preferences', body: S.preferencesSchema },
};

// Refinements/transforms cannot always be expressed in JSON Schema; emit what we can instead of throwing.
const toJsonSchema = (s: ZodType) => z.toJSONSchema(s, { unrepresentable: 'any' });

export function buildOpenApi(routes: { method: string; path: string }[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of routes) {
    const key = `${r.method} ${r.path}`;
    const doc = ROUTE_DOCS[key];
    if (!doc) continue;
    const oaPath = r.path.replace(/:([A-Za-z]+)/g, '{$1}');
    const params = [...r.path.matchAll(/:([A-Za-z]+)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    const op: Record<string, unknown> = { summary: doc.summary, parameters: params, responses: { '200': { description: 'OK' } } };
    if (doc.body) op.requestBody = { required: true, content: { 'application/json': { schema: toJsonSchema(doc.body) } } };
    if (doc.query) {
      const q = toJsonSchema(doc.query) as { properties?: Record<string, unknown> };
      op.parameters = [...params, ...Object.keys(q.properties ?? {}).map((name) => ({ name, in: 'query', required: true, schema: q.properties![name] }))];
    }
    (paths[oaPath] ??= {})[r.method.toLowerCase()] = op;
  }
  return { openapi: '3.1.0', info: { title: 'DoseCare API', version: '0.1.0' }, paths };
}

export const DOCS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>DoseCare API</title></head>
<body><script id="api-reference" data-url="/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script></body></html>`;
