import { EvalScenario } from './types.js'

/**
 * Returns a mock provider response that calls the specified tools.
 * Each tool call is constructed from the scenario's tool definitions.
 */
export function getMockToolUses(scenario: EvalScenario, toolNames: string[]): Array<{ id: string; name: string; input: Record<string, any> }> {
  return toolNames.map((name, i) => {
    const tool = scenario.tools.find(t => t.name === name)
    if (!tool) return { id: `tu_${i}`, name, input: {} }
    // Generate reasonable mock input based on parameter schema
    const input: Record<string, any> = {}
    const props = tool.parameterSchema.properties ?? {}
    for (const [key, schema] of Object.entries(props)) {
      const s = schema as Record<string, any>
      if (s.type === 'string') {
        if (key.includes('city') || key.includes('location')) input[key] = 'Paris'
        else if (key.includes('query') || key.includes('term') || key.includes('search')) input[key] = 'typescript testing best practices'
        else if (key.includes('format')) input[key] = 'json'
        else if (key.includes('text') || key.includes('content')) input[key] = 'sample text content'
        else if (key.includes('name') || key.includes('title')) input[key] = 'Test Report'
        else if (key.includes('email')) input[key] = 'test@example.com'
        else if (key.includes('url') || key.includes('link')) input[key] = 'https://example.com'
        else if (key.includes('file')) input[key] = '/tmp/test.txt'
        else if (key.includes('lang') || key.includes('language')) input[key] = 'english'
        else input[key] = 'example'
      } else if (s.type === 'number' || s.type === 'integer') {
        input[key] = 42
      } else if (s.type === 'boolean') {
        input[key] = true
      } else if (s.type === 'array') {
        input[key] = ['item1']
      } else {
        input[key] = 'example'
      }
    }
    return { id: `tu_${i}`, name, input }
  })
}

export const scenarios: EvalScenario[] = [
  // 1. Single tool call — call get_weather, verify correct
  {
    name: 'single_tool_call',
    description: 'Model correctly selects and calls a single tool',
    tags: ['plumbing'],
    tools: [
      {
        name: 'get_weather',
        description: 'Get weather for a city',
        handler: (args) => `72°F and sunny in ${args.city}`,
        parameterSchema: {
          type: 'object',
          properties: { city: { type: 'string', description: 'City name' } },
          required: ['city'],
        },
      },
    ],
    userMessage: "What's the weather in Paris?",
    validate: (calls) => calls.some(c => c.name === 'get_weather' && c.input.city?.toLowerCase().includes('paris')),
    maxRounds: 2,
    expectCompletion: true,
  },

  // 2. Two-step sequential — first get_weather, then format_response
  {
    name: 'two_step_sequential',
    description: 'Model calls tools in correct sequential order',
    tags: ['plumbing', 'multi-step'],
    tools: [
      {
        name: 'get_weather',
        description: 'Get weather for a city',
        handler: (args) => `72°F and sunny in ${args.city}`,
        parameterSchema: {
          type: 'object',
          properties: { city: { type: 'string', description: 'City name' } },
          required: ['city'],
        },
      },
      {
        name: 'format_response',
        description: 'Format a response for the user',
        handler: (args) => `Formatted: ${args.text}`,
        parameterSchema: {
          type: 'object',
          properties: { text: { type: 'string', description: 'Text to format' } },
          required: ['text'],
        },
      },
    ],
    userMessage: 'Get the weather in Tokyo and format the response nicely',
    validate: (calls) => {
      const weatherIdx = calls.findIndex(c => c.name === 'get_weather')
      const formatIdx = calls.findIndex(c => c.name === 'format_response')
      return weatherIdx >= 0 && formatIdx >= 0 && formatIdx > weatherIdx
    },
    maxRounds: 4,
    expectCompletion: true,
  },

  // 3. Correct arguments — call search with correct params
  {
    name: 'correct_arguments',
    description: 'Model passes correct argument values to tool',
    tags: ['plumbing', 'arguments'],
    tools: [
      {
        name: 'search',
        description: 'Search the web for information',
        handler: (args) => `Results for: ${args.query} (limit: ${args.limit ?? 10})`,
        parameterSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'integer', description: 'Max results' },
          },
          required: ['query'],
        },
      },
    ],
    userMessage: 'Search for "typescript testing best practices" with at most 5 results',
    validate: (calls) => {
      const searchCall = calls.find(c => c.name === 'search')
      return !!searchCall
        && searchCall.input.query?.toLowerCase().includes('typescript')
        && (searchCall.input.limit === undefined || searchCall.input.limit === 5)
    },
    maxRounds: 2,
    expectCompletion: true,
  },

  // 4. No tool needed — simple greeting, no tool calls
  {
    name: 'no_tool_needed',
    description: 'Model handles simple greeting without calling any tools',
    tags: ['plumbing', 'no-tool'],
    tools: [
      {
        name: 'get_weather',
        description: 'Get weather for a city',
        handler: (args) => `72°F and sunny in ${args.city}`,
        parameterSchema: {
          type: 'object',
          properties: { city: { type: 'string', description: 'City name' } },
          required: ['city'],
        },
      },
    ],
    userMessage: 'Hello, how are you today?',
    validate: (calls) => calls.length === 0,
    maxRounds: 2,
    expectCompletion: true,
  },

  // 5. Error recovery — tool fails first, then retries successfully
  {
    name: 'error_recovery',
    description: 'Model recovers from tool error and retries successfully',
    tags: ['plumbing', 'error-handling'],
    tools: [
      {
        name: 'get_weather',
        description: 'Get weather for a city',
        handler: (args) => `72°F and sunny in ${args.city}`,
        parameterSchema: {
          type: 'object',
          properties: { city: { type: 'string', description: 'City name' } },
          required: ['city'],
        },
      },
    ],
    userMessage: 'What is the weather in London?',
    validate: (calls) => {
      // At least one successful get_weather call for London
      const successCalls = calls.filter(c => c.name === 'get_weather' && !c.output.includes('Error'))
      return successCalls.length >= 1
        && successCalls.some(c => c.input.city?.toLowerCase().includes('london'))
    },
    maxRounds: 4,
    expectCompletion: true,
  },

  // 6. Multiple tools — call multiple tools in one round
  {
    name: 'multiple_tools',
    description: 'Model calls multiple tools in a single response',
    tags: ['plumbing', 'multi-tool'],
    tools: [
      {
        name: 'get_weather',
        description: 'Get weather for a city',
        handler: (args) => `72°F and sunny in ${args.city}`,
        parameterSchema: {
          type: 'object',
          properties: { city: { type: 'string', description: 'City name' } },
          required: ['city'],
        },
      },
      {
        name: 'get_time',
        description: 'Get current time for a timezone',
        handler: (args) => `3:00 PM in ${args.timezone}`,
        parameterSchema: {
          type: 'object',
          properties: { timezone: { type: 'string', description: 'Timezone name' } },
          required: ['timezone'],
        },
      },
    ],
    userMessage: 'What is the weather and current time in New York?',
    validate: (calls) => {
      const weatherCalled = calls.some(c => c.name === 'get_weather')
      const timeCalled = calls.some(c => c.name === 'get_time')
      return weatherCalled && timeCalled
    },
    maxRounds: 4,
    expectCompletion: true,
  },

  // 7. Data extraction — extract structured info from text
  {
    name: 'data_extraction',
    description: 'Model extracts structured information from text',
    tags: ['plumbing', 'extraction'],
    tools: [
      {
        name: 'save_contact',
        description: 'Save a contact to the address book',
        handler: (args) => `Saved contact: ${args.name} <${args.email}>`,
        parameterSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Contact name' },
            email: { type: 'string', description: 'Contact email' },
          },
          required: ['name', 'email'],
        },
      },
    ],
    userMessage: 'Please save my friend John Smith. His email is john.smith@example.com.',
    validate: (calls) => {
      const saveCall = calls.find(c => c.name === 'save_contact')
      return !!saveCall
        && saveCall.input.name?.toLowerCase().includes('john')
        && saveCall.input.email?.toLowerCase().includes('john.smith')
    },
    maxRounds: 2,
    expectCompletion: true,
  },

  // 8. Conditional logic — choose tool based on condition
  {
    name: 'conditional_logic',
    description: 'Model selects correct tool based on user intent',
    tags: ['plumbing', 'conditional'],
    tools: [
      {
        name: 'convert_temperature',
        description: 'Convert temperature between Celsius and Fahrenheit',
        handler: (args) => `${args.value}°${args.from_unit} = ${args.value * 1.8 + 32}°F`,
        parameterSchema: {
          type: 'object',
          properties: {
            value: { type: 'number', description: 'Temperature value' },
            from_unit: { type: 'string', description: 'Source unit (C or F)' },
          },
          required: ['value', 'from_unit'],
        },
      },
      {
        name: 'convert_distance',
        description: 'Convert distance between miles and kilometers',
        handler: (args) => `${args.value} ${args.from_unit} = ${args.value * 1.609} km`,
        parameterSchema: {
          type: 'object',
          properties: {
            value: { type: 'number', description: 'Distance value' },
            from_unit: { type: 'string', description: 'Source unit (mi or km)' },
          },
          required: ['value', 'from_unit'],
        },
      },
    ],
    userMessage: 'Convert 25 degrees Celsius to Fahrenheit',
    validate: (calls) => {
      const tempCall = calls.find(c => c.name === 'convert_temperature')
      const distCall = calls.find(c => c.name === 'convert_distance')
      return !!tempCall
        && tempCall.input.value === 25
        && tempCall.input.from_unit === 'C'
        && !distCall
    },
    maxRounds: 2,
    expectCompletion: true,
  },

  // 9. Long context — correct tool call after multiple conversation turns
  {
    name: 'long_context',
    description: 'Model correctly calls tool after long multi-turn context',
    tags: ['plumbing', 'context'],
    tools: [
      {
        name: 'search',
        description: 'Search for information',
        handler: (args) => `Found results for: ${args.query}`,
        parameterSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
    ],
    userMessage: 'After all our discussion, can you search for recent advances in quantum computing?',
    validate: (calls) => {
      const searchCall = calls.find(c => c.name === 'search')
      return !!searchCall
        && searchCall.input.query?.toLowerCase().includes('quantum computing')
    },
    maxRounds: 2,
    expectCompletion: true,
  },

  // 10. Parallel independent — two independent tools, both completed
  {
    name: 'parallel_independent',
    description: 'Model calls two independent tools and both complete',
    tags: ['plumbing', 'parallel'],
    tools: [
      {
        name: 'get_stock_price',
        description: 'Get current stock price',
        handler: (args) => `${args.symbol}: $150.00`,
        parameterSchema: {
          type: 'object',
          properties: { symbol: { type: 'string', description: 'Stock ticker symbol' } },
          required: ['symbol'],
        },
      },
      {
        name: 'get_exchange_rate',
        description: 'Get currency exchange rate',
        handler: (args) => `1 ${args.from} = 1.08 ${args.to}`,
        parameterSchema: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Source currency' },
            to: { type: 'string', description: 'Target currency' },
          },
          required: ['from', 'to'],
        },
      },
    ],
    userMessage: 'What is the current price of AAPL and the USD to EUR exchange rate?',
    validate: (calls) => {
      const stockCalled = calls.some(c => c.name === 'get_stock_price' && c.input.symbol === 'AAPL')
      const exchangeCalled = calls.some(c => c.name === 'get_exchange_rate' && c.input.from === 'USD' && c.input.to === 'EUR')
      return stockCalled && exchangeCalled
    },
    maxRounds: 4,
    expectCompletion: true,
  },
]
