# Chronicle — Project Kickoff

> A progress-locked reading companion that feels like a codex in a video game.

## Vision

Chronicle lets readers upload an ebook, set their progress, and explore a wiki populated only with what they've already encountered. Entries read like the reader's own notes — characters, locations, events, themes — unlocking as they progress through the book or series. Think of it like a journal or creature codex in an RPG: you don't see the dragon entry until you've met the dragon.

Users process books using their own AI API key (BYOK model), then optionally share their generated entries with the community so future readers get them for free.

## Strategic Alignment

This project exists to fill specific resume gaps identified in market research while producing a genuine, useful tool.

### Gaps Addressed

| Gap | Priority | How Chronicle Fills It |
|-----|----------|----------------------|
| Next.js App Router + Server Components | **High** | Core framework. Server components for wiki rendering, server actions for AI proxy and data mutations. |
| Fullstack positioning | **High** | Auth, database, API design, background processing — end-to-end ownership. |
| PostgreSQL | **Medium** | Primary datastore. Relational model fits books/chapters/entries/users well. |
| Docker | **Medium** | Docker Compose for local dev (Postgres + app). Dockerfile for production. |
| Playwright | **Medium** | E2E test suite covering core flows (upload, progress, wiki navigation). |
| Vercel deployment | **Low** | Production hosting with preview deploys on PRs. |

### Portfolio Positioning

Chronicle pairs with WaveLength to show range:
- **WaveLength** = creative, visual, game engine, Canvas API, solo frontend
- **Chronicle** = fullstack, data-driven, AI integration, community features, production architecture

Together they tell the story: "I can build anything from a custom game engine to a fullstack AI-powered web app."

## Core Concept

### The Codex Model

A reader's Chronicle for a book is a personal codex that grows as they read:

- **Entries**: Wiki-style pages for characters, locations, factions, items, events, themes, etc.
- **Progress-locked**: Each entry has a "first appearance" chapter. Entries and details within entries are hidden until the reader's progress passes that point.
- **Spoiler-safe**: Entry content is scoped to what the reader has seen. A character entry at Chapter 5 won't mention their betrayal in Chapter 20.
- **Connective**: Entries link to each other, forming a navigable web of the book's world — but only through discovered connections.

### BYOK (Bring Your Own Key) Model

Users provide their own AI API key to process books. This keeps the platform free to run:

- User enters their API key (OpenAI, Anthropic, etc.)
- Key is encrypted at rest in the database, never logged
- Server proxies AI calls using the user's key
- Processing cost falls on the individual user (~$1-5 per book depending on length and provider)
- Generated entries are stored in the shared database
- User can choose to share entries publicly or keep them private

**Community benefit**: The first person to process a book pays the AI cost. Everyone after uses the community version for free.

### Legal Guardrails

To stay on the right side of copyright:

- **Quote limits**: Max 50 words per quote, limited quotes per entry
- **Transformative content**: Entries should analyze, connect, and contextualize — not summarize plot
- **Reading companion, not replacement**: The progress-lock design inherently assumes the user is reading the book. Entries are most valuable alongside reading, not instead of it.
- **Attribution**: All entries clearly marked as AI-generated with user attribution
- **DMCA process**: Takedown mechanism for rights holders
- **ToS**: Users accept responsibility for content they generate and share
- **Private mode**: Users can keep their entries private (no community sharing)

## Tech Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| Framework | **Next.js 15 (App Router)** | Server components, server actions, API routes. Fills highest-priority gap. |
| Language | **TypeScript** | Non-negotiable. Strict mode. |
| Database | **PostgreSQL** | Relational model fits the domain. Fills database gap. Via Prisma or Drizzle ORM. |
| Auth | **Auth.js (NextAuth v5)** | OAuth providers (GitHub, Google). Session management. |
| AI Integration | **Multi-provider** | Abstract AI calls behind a provider interface. Support OpenAI + Anthropic initially. |
| Styling | **Tailwind CSS** | Fast iteration, consistent design. Already familiar. |
| Testing | **Playwright** | E2E tests for core user flows. Fills testing gap. |
| Containerization | **Docker Compose** | Local dev: Postgres + app. Fills Docker gap. |
| Hosting | **Vercel** | Next.js-native deployment. Preview deploys on PRs. |
| File handling | **ePub parsing library** | epub.js or similar for extracting chapters and text from ebook files. |

## Data Model (Simplified)

```
User
  ├── api_keys (encrypted)
  ├── reading_progress[] → Book + current chapter
  └── generated entries (author relationship)

Book
  ├── title, author, metadata
  ├── chapters[] (ordered)
  └── processing_status

Entry
  ├── book_id
  ├── type (character | location | faction | item | event | theme | other)
  ├── name, content (markdown)
  ├── first_appearance_chapter
  ├── connections[] → other Entry IDs
  ├── quotes[] (with chapter references)
  ├── visibility (public | private)
  └── generated_by (user_id)
```

## MVP Scope

The MVP should be deployable, demonstrable, and resume-ready. Not feature-complete.

### MVP (v1) — "One Book, One Reader"

- [ ] Upload an ePub file and extract chapter structure
- [ ] Connect an AI API key (OpenAI or Anthropic)
- [ ] Process a book: generate wiki entries with chapter-locked visibility
- [ ] Set reading progress (chapter selector)
- [ ] Browse entries filtered by progress (only see what you've read)
- [ ] Entry pages with linked connections to other entries
- [ ] Basic auth (GitHub OAuth)
- [ ] PostgreSQL storage for books, entries, progress
- [ ] Docker Compose for local dev
- [ ] Deployed to Vercel
- [ ] Playwright tests for core flows (upload → process → browse → progress)

### Post-MVP Ideas (not committed)

- Community sharing (public entries, browse other users' books)
- Book library / search (find books others have processed)
- Series support (entries span multiple books, progress across volumes)
- Reading group features (shared progress, discussion threads)
- Multiple AI provider support (beyond initial two)
- Entry editing / user annotations on top of AI-generated content
- Mobile-responsive reading companion mode
- Book club integration

## Success Criteria

The project is "resume-ready" when:

1. **Deployed and live** — accessible at a public URL
2. **Core flow works** — upload → process → set progress → browse entries
3. **Looks polished** — clean UI, loading states, error handling
4. **Tested** — Playwright suite covers the happy path
5. **Dockerized** — can `docker compose up` for local dev
6. **Documented** — README with screenshots, tech stack, architecture decisions

## Open Questions

- **ORM choice**: Prisma vs Drizzle? Prisma has more ecosystem support, Drizzle is lighter and more SQL-native. Either works.
- **ePub parsing**: Need to evaluate libraries for reliability. Some ePubs have inconsistent formatting.
- **AI prompt design**: How to structure prompts to generate good, spoiler-safe entries. This is the core UX challenge and will need iteration.
- **Book identification**: ISBN lookup? Manual entry? How to match community entries to the same book across uploads?
- **Cost estimation**: Need to estimate token usage per book to set user expectations before processing.
