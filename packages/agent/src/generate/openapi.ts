// The OpenAPI 3.1 document (SPEC 7.1, 3.4, 11): POST /api/actions/{id} for every action on the
// http transport with the deck, author and force parameters and the bearer scheme, GET on the same
// path for the action's contract, GET /api/agent for the manifest, /mcp for MCP over streamable
// HTTP, the named document schemas and the one error body under components. The studio serves
// the committed JSON at /openapi.json.
import { actionsOn } from '@turboslide/schema/actions';
import type { JsonSchema } from './json-schema.ts';
import { generateNamedSchemas } from './named.ts';

export const OPENAPI_VERSION = '3.1.0';
export const API_VERSION = '0.1.0';

/** The one error body of the HTTP surface (packages/agent/src/http/errors.ts). */
const errorSchema: JsonSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          enum: ['TypeError', 'RangeError', 'ConflictError', 'NotImplementedError', 'Error'],
        },
        status: { type: 'integer' },
        message: { type: 'string' },
        code: {
          type: 'string',
          enum: [
            'unknown_field',
            'invalid_input',
            'unauthorized',
            'payload_too_large',
            'not_json',
            'unknown_action',
            'not_on_http',
            'method_not_allowed',
            'no_session',
            'unknown_deck',
          ],
          description: 'The machine-readable reason beyond the class name',
        },
        pointer: {
          type: 'string',
          description:
            'A JSON pointer to the field a 400 is about (unknown_field names the extra key)',
        },
        action: { type: 'string' },
        currentRevision: { type: 'integer', description: 'For ConflictError' },
        current: {
          description: 'The current document for ConflictError, so the re-read is free',
          type: 'object',
          properties: {
            deck: { $ref: '#/components/schemas/Deck' },
            slides: {
              type: 'object',
              additionalProperties: { $ref: '#/components/schemas/Slide' },
            },
          },
        },
        holder: {
          description: 'The lease holder when a write was refused for a held lease',
          $ref: '#/components/schemas/Author',
        },
        milestone: { type: 'string', description: 'For NotImplementedError' },
      },
      required: ['name', 'status', 'message'],
    },
  },
  required: ['error'],
};

const deckParameter = {
  name: 'deck',
  in: 'query',
  required: false,
  schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
  description: 'The deck id under decks/; the instance default (gt-brand) when absent',
};

const authorParameter = {
  name: 'x-turboslide-author',
  in: 'header',
  required: false,
  schema: { type: 'string' },
  description: 'human name or agent:<runId>; agent:http when absent (?author= is accepted too)',
};

const forceParameter = {
  name: 'force',
  in: 'query',
  required: false,
  schema: { type: 'boolean' },
  description:
    'Write to a slide another author leased (SPEC 6.7 force); x-turboslide-force: 1 is the header form',
};

const actionParameter = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'An action id from the table, such as slide.update',
};

const errorContent = {
  'application/json': { schema: { $ref: '#/components/schemas/Error' } },
};

export function generateOpenApi(): JsonSchema {
  const named = generateNamedSchemas((id) => `#/components/schemas/${id}`);
  const httpActions = actionsOn('http');
  const schemas: Record<string, JsonSchema> = { ...named.schemas, Error: errorSchema };

  const paths: Record<string, unknown> = {
    '/api/agent': {
      get: {
        operationId: 'agent.manifest',
        summary:
          'The agent manifest: transports, execution rules, actions, what this instance implements, skills and resources',
        tags: ['discovery'],
        responses: {
          '200': {
            description: 'The manifest',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '401': { description: 'Bearer token required off localhost', content: errorContent },
        },
      },
    },
    '/api/actions/{id}': {
      get: {
        operationId: 'agent.describeAction',
        summary: 'The contract of one action and whether this instance implements it',
        tags: ['discovery'],
        parameters: [actionParameter],
        responses: {
          '200': {
            description:
              'id, label, doc, group, mutates, transports, milestone, implemented, input and output JSON Schema, cli, mcp, example',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '401': { description: 'Bearer token required off localhost', content: errorContent },
          '404': {
            description: 'Unknown action, or one not offered on http',
            content: errorContent,
          },
        },
      },
    },
    '/mcp': {
      post: {
        operationId: 'mcp.rpc',
        summary: 'MCP over streamable HTTP: JSON-RPC requests (initialize first)',
        description:
          'Tools deck_<action> for every implemented action on the mcp transport, the deck:// resources and the deck_review prompt; the mcp-session-id header carries the session; ?deck= and x-turboslide-author bind the session at initialize; deck_goto_slide is listed while a studio page is attached.',
        tags: ['discovery'],
        parameters: [deckParameter, authorParameter],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          '200': { description: 'A JSON-RPC response, as JSON or as an SSE stream' },
          '401': { description: 'Bearer token required off localhost', content: errorContent },
        },
      },
      get: {
        operationId: 'mcp.stream',
        summary: 'The server to client notification stream of an MCP session',
        tags: ['discovery'],
        responses: { '200': { description: 'text/event-stream' } },
      },
      delete: {
        operationId: 'mcp.close',
        summary: 'Ends an MCP session',
        tags: ['discovery'],
        responses: { '200': { description: 'Closed' } },
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
        description:
          'Malformed input (TypeError) with the Zod path; an unknown field carries code unknown_field and a JSON pointer',
        content: errorContent,
      },
      '401': { description: 'Bearer token required off localhost', content: errorContent },
      '404': { description: 'Unknown id (RangeError)', content: errorContent },
      '413': {
        description: `Body over the cap (${spec.id === 'asset.add' || spec.id === 'asset.capture' ? '25 MB' : '1 MB'})`,
        content: errorContent,
      },
      '500': { description: 'Renderer or codec failure', content: errorContent },
      '501': {
        description: `Declared, lands in ${spec.milestone} (NotImplementedError)`,
        content: errorContent,
      },
    };
    if (spec.mutates) {
      responses['409'] = {
        description:
          'Stale baseRevision or a held lease (ConflictError), with currentRevision, the current document and the holder',
        content: errorContent,
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
        parameters: [deckParameter, authorParameter, ...(spec.mutates ? [forceParameter] : [])],
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
    security: [{ bearer: [] }, {}],
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
    components: {
      schemas,
      securitySchemes: {
        bearer: {
          type: 'http',
          scheme: 'bearer',
          description:
            'TURBOSLIDE_TOKEN of the deployment (SPEC 11). Required on every host but localhost; an instance without a token serves localhost only.',
        },
      },
    },
  };
}
