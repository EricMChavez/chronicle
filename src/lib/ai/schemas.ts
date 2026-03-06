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
          blocks: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                type: {
                  type: "string" as const,
                  enum: ["summary", "observation", "quote", "appearance"],
                },
                text: { type: "string" as const },
                anchor: { type: "string" as const },
                speaker: { type: "string" as const },
                context: { type: "string" as const },
              },
              required: ["type", "text"],
            },
          },
        },
        required: ["name"],
      },
    },
  },
  required: ["subjects"],
};
