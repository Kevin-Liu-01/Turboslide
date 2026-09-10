import { createFileRoute } from '@tanstack/react-router';

import { describe } from '../../server/contracts';

// GET /api/agent: describe(), the manifest with the action table (SPEC 7.4).
// Read only in M1; the write surface (/api/actions/:action) is M4.
export const Route = createFileRoute('/api/agent')({
  server: {
    handlers: {
      GET: async () => Response.json(describe()),
    },
  },
});
