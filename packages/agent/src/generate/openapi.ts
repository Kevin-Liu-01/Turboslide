// The OpenAPI 3.1 document (SPEC 7.1, 3.4): POST /api/actions/{id} for every action on the http
// transport, GET /api/agent for the manifest, the named document schemas under components. The
// studio serves the committed JSON at /openapi.json.
import { actionsOn } from '@turboslide/schema/actions';
import type { JsonSchema } from './json-schema.ts';
import { generateNamedSchemas } from './named.ts';

export const OPENAPI_VERSION = '3.1.0';
export const API_VERSION = '0.1.0';

const errorSchema: JsonSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'string',
      enum: ['TypeError', 'RangeError', 'ConflictError', 'NotImplementedError', 'Error'],
    },
    message: { type: 'string' },
    path: {
      type: 'array',
      items: { type: ['string', 'integer'] },
      description: 'The Zod path for TypeError',
    },
    currentRevision: { type: 'integer', description: 'For ConflictError' },
    current: {
      description: 'The current document for ConflictError',
      $ref: '#/components/schemas/Deck',
    },
    holder: { $ref: '#/components/schemas/Author' },
  },
  required: ['error', 'message'],
};

export function generateOpenApi(): JsonSchema {
  const named = generateNamedSchemas((id) => `#/components/schemas/${id}`);
  const httpActions = actionsOn('http');
  const schemas: Record<string, JsonSchema> = { ...named.schemas, Error: errorSchema };

  const paths: Record<string, unknown> = {
    '/api/agent': {
      get: {
        operationId: 'agent.manifest',
        summary: 'The agent manifest: transports, actions, skills and resources',
        tags: ['discovery'],
        responses: {
          '200': {
            description: 'The manifest',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/openapi.json': {
      get: {
        operationId: 'agent.openapi',
        summary: 'This document',
        tags: ['discovery'],
        responses: {
          '200': {
            description: 'OpenAPI 3.1',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/llms.txt': {
      get: {
        operationId: 'agent.llms',
        summary: 'The short machine guide',
        tags: ['discovery'],
        responses: {
          '200': {
            description: 'Plain text',
            content: { 'text/plain': { schema: { type: 'string' } } },
          },
        },
      },
    },
  };
  for (const spec of httpActions) {
    const responses: Record<string, unknown> = {
      '200': {
        description: spec.mutates ? 'The normalized result at the new revision' : 'The result',
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${named.outputId(spec.id)}` },
          },
        },
      },
      '400': {
        description: 'Malformed input (TypeError) with the Zod path',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      '404': {
        description: 'Unknown id (RangeError)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      '500': {
        description: 'Renderer or codec failure',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      '501': {
        description: `Declared, lands in ${spec.milestone} (NotImplementedError)`,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    };
    if (spec.mutates) {
      responses['409'] = {
        description:
          'Stale baseRevision or a held lease (ConflictError), with the current document',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      };
    }
    paths[`/api/actions/${spec.id}`] = {
      post: {
        operationId: spec.id,
        summary: spec.label,
        description: spec.doc,
        tags: [spec.group],
        'x-mutates': spec.mutates,
        'x-milestone': spec.milestone,
        'x-transports': spec.transports,
        parameters: [
          {
            name: 'x-turboslide-author',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'human name or agent:<runId>',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${named.inputId(spec.id)}` },
            },
          },
        },
        responses,
      },
    };
  }

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: 'Turboslide agent API',
      version: API_VERSION,
      description:
        'Every operation is a named action in one action table (SPEC 7.1). A designer’s click and an agent’s call take the same path through the same validator with the same baseRevision. Every mutating action requires baseRevision and rejects a stale one with 409 and the current document; every write returns the normalized result so the re-read is free.',
    },
    servers: [
      { url: 'http://localhost:4321', description: 'The studio dev server (always port 4321)' },
    ],
    tags: [
      { name: 'discovery' },
      { name: 'deck' },
      { name: 'slide' },
      { name: 'block' },
      { name: 'asset' },
      { name: 'render' },
      { name: 'lint' },
      { name: 'version' },
      { name: 'export' },
      { name: 'view' },
    ],
    paths,
    components: { schemas },
  };
}
