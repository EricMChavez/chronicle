export type EntryType =
  | "character"
  | "location"
  | "faction"
  | "item"
  | "event"
  | "theme"
  | "other";

const SECTION_GUIDELINES: Record<EntryType, string> = {
  character: `Suggested sections (include only those with material):
- **What We Know**: Physical description, background, occupation, status
- **Actions & Choices**: Key decisions and behaviors observed in the text
- **What Others Say**: How other characters describe or react to them
- **Key Quotes**: The most vivid or revealing quotes (2-4 max)
- **Connections**: Relationships to other entities, demonstrated through text`,

  location: `Suggested sections (include only those with material):
- **Description**: Physical appearance, atmosphere, sensory details from the text
- **Who's Here**: Characters associated with this place
- **What Happens Here**: Key events or scenes that take place here
- **Atmosphere**: Mood, tone, and feeling conveyed by the text
- **Connections**: Links to other locations, characters, or events`,

  event: `Suggested sections (include only those with material):
- **What Happened**: Factual account of the event as described
- **Who Was Involved**: Characters present and their roles
- **What Changed**: Consequences or shifts that resulted
- **Key Quotes**: Dialogue or narration from the event (2-4 max)
- **Connections**: Links to characters, locations, or other events`,

  faction: `Suggested sections (include only those with material):
- **Who They Are**: Identity, purpose, distinguishing characteristics
- **Members**: Known members and their roles
- **Goals & Methods**: What they want and how they pursue it
- **Reputation**: How others view or describe them
- **Connections**: Links to characters, locations, or other factions`,

  theme: `Suggested sections (include only those with material):
- **Where It Appears**: Scenes or moments where this theme surfaces
- **Key Moments**: The most significant instances
- **Characters Involved**: Who embodies or confronts this theme
- **Connections**: Links to other themes, characters, or events`,

  item: `Suggested sections (include only those with material):
- **Description**: Physical appearance and notable features
- **History**: How it came to be or was acquired
- **Who Possesses It**: Current and past owners
- **Significance**: Why it matters in the story
- **Connections**: Links to characters, events, or locations`,

  other: `Suggested sections (include only those with material):
- **What We Know**: Key facts and observations from the text
- **Key Quotes**: Relevant quotes (2-4 max)
- **Connections**: Links to other entities`,
};

export function getSectionGuidelines(type: EntryType): string {
  return SECTION_GUIDELINES[type] || SECTION_GUIDELINES.other;
}
