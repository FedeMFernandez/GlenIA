const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');
const s = z.object({
  type: z.enum(['transfer','payout','refund']),
  amount: z.number().positive(),
  currency: z.string().length(3),
  reference: z.string().optional(),
  destination: z.string().optional(),
});
console.log(JSON.stringify(zodToJsonSchema(s, { target: 'openApi3' }), null, 2));
