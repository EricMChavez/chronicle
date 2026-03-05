export const structureJsonSchema = {
  type: "object" as const,
  properties: {
    subjects: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          category: { type: "string" as const },
          status: { type: "string" as const, enum: ["new", "existing"] },
          paragraphs: { type: "string" as const },
          significance: { type: "integer" as const, minimum: 1, maximum: 10 },
          tags: {
            type: "array" as const,
            items: { type: "string" as const },
          },
        },
        required: ["name", "category"],
      },
    },
  },
  required: ["subjects"],
};

export const detailJsonSchema = {
  type: "object" as const,
  properties: {
    subjects: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          aliases: {
            type: "array" as const,
            items: { type: "string" as const },
          },
          summary: { type: "string" as const },
          observations: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                fact: { type: "string" as const },
                anchor: { type: "string" as const },
              },
              required: ["fact"],
            },
          },
          quotes: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                text: { type: "string" as const },
                speaker: { type: "string" as const },
                context: { type: "string" as const },
              },
              required: ["text"],
            },
          },
        },
        required: ["name"],
      },
    },
  },
  required: ["subjects"],
};
