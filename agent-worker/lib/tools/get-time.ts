/**
 * get_time tool — get current time in a timezone
 */

export const getTimeTool = {
  name: 'get_time',
  description: 'Get the current time in a specified timezone',
  example: '{"timezone": "Australia/Sydney"}',

  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Timezone identifier (e.g. "Australia/Sydney", "Asia/Shanghai", "UTC"). Defaults to UTC if not provided.',
      },
    },
    required: [],
  },

  execute: async (args: Record<string, unknown>) => {
    const tz = args.timezone as string | undefined;

    if (!tz || tz === 'UTC') {
      return {
        success: true,
        time: new Date().toISOString(),
        tz: 'UTC',
      };
    }

    try {
      const time = new Date().toLocaleString('en-US', { timeZone: tz, hour12: false });
      return {
        success: true,
        time,
        tz,
      };
    } catch {
      return {
        success: false,
        error: `Invalid timezone: ${tz}`,
      };
    }
  },
};