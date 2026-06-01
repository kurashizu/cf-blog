/**
 * eval_expression tool — safe JavaScript expression evaluator
 */
import { evaluate } from '@/lib/evaluator';

export const evalExpressionTool = {
  name: 'eval_expression',
  description: 'Evaluate a safe JavaScript expression (math, JSON, Date, String, Array operations)',
  example: '{"code": "1 + 2 * 3"}',

  parameters: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'JavaScript expression to evaluate',
      },
    },
    required: ['code'],
  },

  execute: async (args: Record<string, unknown>) => {
    const code = args.code as string;
    if (typeof code !== 'string') {
      return { success: false, error: 'code must be a string' };
    }
    return evaluate(code);
  },
};