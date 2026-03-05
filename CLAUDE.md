# Chronicle — Claude Code Instructions

## Documentation Maintenance

When making changes to any of the following areas, update the corresponding diagram in `docs/ARCHITECTURE.md`:

- **DB schema** (`src/lib/db/schema/`, `src/lib/db/relations.ts`) — update the ER diagram
- **Processing pipeline** (`src/lib/processing/book-processor.ts`, `src/lib/processing/chapter-splitter.ts`, `src/lib/processing/abort-registry.ts`) — update the pipeline flowchart
- **Auth or request flow** (`src/auth.ts`, `src/app/api/`) — update the request flow sequence diagram
- **Processing status enum** (`src/lib/db/schema/books.ts` `processingStatusEnum`) — update the state machine diagram
- **Module structure** (adding/removing directories under `src/`) — update the module structure diagram
