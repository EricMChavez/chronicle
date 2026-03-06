# Chronicle Architecture

Chronicle is a progress-locked reading companion that processes ePub books through an AI pipeline, producing encyclopedia-style entries (characters, locations, themes, etc.) that are filtered by how far the reader has progressed. This document provides visual diagrams of the system's architecture.

---

## Database Schema

The database has 11 tables split across four domains: authentication (managed by Auth.js/Drizzle adapter), books & chapters (including incremental extraction cache), AI-generated entries with supporting data, and user state (reading progress & API keys). All foreign keys cascade on delete from their parent.

```mermaid
erDiagram
    users {
        text id PK
        text name
        text email UK
        timestamp emailVerified
        text image
    }

    accounts {
        text userId FK
        text type
        text provider PK
        text providerAccountId PK
        text access_token
        text refresh_token
        integer expires_at
    }

    sessions {
        text sessionToken PK
        text userId FK
        timestamp expires
    }

    verification_tokens {
        text identifier PK
        text token PK
        timestamp expires
    }

    books {
        text id PK
        text title
        text author
        text description
        text isbn
        text metadataHash
        text contentHash
        integer totalChapters
        processing_status processingStatus
        integer processingProgress
        integer compiledChapters
        text processingError
        jsonb metadata
        text uploadedBy FK
    }

    chapters {
        text id PK
        text bookId FK
        integer chapterNumber
        text title
        text content
        integer wordCount
    }

    entries {
        text id PK
        text bookId FK
        text name "UK(bookId,name)"
        text category
        text_array aliases
        text content
        integer firstAppearanceChapter
        integer significance
        text_array tags
        boolean isPublic
        text generatedBy FK
    }

    entry_quotes {
        text id PK
        text entryId FK
        text text
        text speaker
        text context
        integer chapter
    }

    entry_sources {
        text id PK
        text entryId FK
        integer chapter
        text observation
        text anchor
        text sectionHeading
        integer sortOrder
    }

    chapter_summaries {
        text id PK
        text bookId FK
        integer chapterNumber UK
        text summary
    }

    chapter_extractions {
        text id PK
        text bookId FK
        integer chapterNumber UK
        jsonb data
    }

    reading_progress {
        text userId PK_FK
        text bookId PK_FK
        integer currentChapter
    }

    api_keys {
        text id PK
        text userId FK
        ai_provider provider
        text encryptedKey
        text iv
        text authTag
        text label
    }

    users ||--o{ accounts : "has"
    users ||--o{ sessions : "has"
    users ||--o{ books : "uploaded"
    users ||--o{ entries : "generated"
    users ||--o{ reading_progress : "tracks"
    users ||--o{ api_keys : "owns"
    books ||--o{ chapters : "contains"
    books ||--o{ entries : "has"
    books ||--o{ chapter_summaries : "has"
    books ||--o{ chapter_extractions : "caches"
    books ||--o{ reading_progress : "tracked in"
    entries ||--o{ entry_quotes : "has"
    entries ||--o{ entry_sources : "has"
```

---

## Book Processing Pipeline

When a user triggers processing, the system runs an incremental pipeline in the background. An `AbortController` allows cancellation at any checkpoint. Large chapters are automatically split into chunks. Extraction uses a two-step approach: structure discovery identifies subjects and paragraph references, then detail extraction runs in parallel batches grouped by paragraph locality (subjects referencing nearby text share a batch, eliminating duplicate input tokens). Detail extraction produces typed content blocks (summary, observation, quote, appearance) and receives previous blocks for incremental context. Compilation is a deterministic template — no AI call needed.

**Incremental compilation**: After each chapter's extraction, compilation runs on all extractions so far using upserts (`onConflictDoUpdate` on `entries(bookId, name)`). This makes entries available to users immediately — they can browse the Codex and read entries while processing continues. The chapter selector limits selection to compiled chapters. A final compilation after the loop ensures consistency.

**Incremental persistence**: Each chapter's extraction result is saved to `chapter_extractions` immediately after completion. On resume, previously extracted chapters are loaded and skipped. On error/cancel with partial extractions, entries from incremental compilation are already available and status is set to `"partial"`. Saved extractions are cleaned up after successful full completion.

```mermaid
flowchart TD
    A[User clicks Process] --> B[POST /api/books/:id/process]
    B --> C{Auth + API key valid?}
    C -- No --> D[Return error]
    C -- Yes --> E[Create AbortController]
    E --> F[Start background via after]
    F --> G[Set status = processing]

    subgraph Extraction["Phase 1: Multi-Pass Extraction (cheap model)"]
        G --> LOAD[Load saved extractions from DB<br/>rebuild manifest, skip completed]
        LOAD --> H[Load all chapters from DB]
        H --> SKIP{Already extracted?}
        SKIP -- Yes --> P
        SKIP -- No --> I[For each remaining chapter]
        I --> J{Chapter too large?}
        J -- Yes --> K[Split into chunks]
        J -- No --> L1

        subgraph PerChunk["Per chunk/chapter"]
            L1[Step 1: Number paragraphs]
            L1 --> L2[Step 2: Structure discovery<br/>subjects + paragraph refs + significance]
            L2 --> L3[Step 3: Batch by paragraph locality<br/>sort by centroid, pack to output budget]
            L3 --> L4[Step 3: Detail extraction<br/>parallel ×3, dynamic maxTokens<br/>aliases, content blocks + prev context]
        end

        K --> L1
        L4 --> SAVE[Save to chapter_extractions + chapter_summaries]
        SAVE --> M2[Update manifest + processingProgress]
        M2 --> INCR[Incremental compilation<br/>upsert entries from all extractions so far]
        INCR --> COMPILED[Update compiledChapters]
        COMPILED --> P{More chapters?}
        P -- Yes --> Q{Aborted?}
        Q -- No --> SKIP
        Q -- Yes --> PARTIAL_CHECK
        P -- No --> R{Aborted?}
        R -- Yes --> PARTIAL_CHECK
    end

    subgraph CompilationPhase["Final Compilation (consistency pass)"]
        R -- No --> S[Deduplicate + group entities]
        S --> U[For each grouped entity]
        U --> W[compileEntry — deterministic template]
        W --> X[Upsert entry + replace sources + quotes]
        X --> Y{More entities?}
        Y -- Yes --> U
        Y -- No --> ORPHAN[Remove orphaned entries]
    end

    ORPHAN --> CLEAN[Clean up chapter_extractions]
    CLEAN --> AB[Set status = completed]
    AB --> AC[Log token usage summary]

    PARTIAL_CHECK{Extractions saved?}
    PARTIAL_CHECK -- Yes --> PSTATUS[Set status = partial<br/>entries already compiled incrementally]
    PARTIAL_CHECK -- No --> FAIL[Set status = failed]
```

---

## Request Flow

Two key request patterns: (A) a standard authenticated page load with server action, and (B) the processing trigger followed by SSE status polling.

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant NextJS as Next.js Server
    participant Auth as Auth.js (JWT)
    participant DB as PostgreSQL

    note over User, DB: A) Authenticated page request + server action

    User->>Browser: Upload ePub file
    Browser->>NextJS: POST formData (server action)
    NextJS->>Auth: auth() — verify JWT
    Auth-->>NextJS: session { user.id }
    NextJS->>NextJS: Parse ePub, fingerprint
    NextJS->>DB: Check duplicate (isbn / hash)
    DB-->>NextJS: No match
    NextJS->>DB: INSERT book + chapters
    NextJS-->>Browser: redirect(/books/:id)

    note over User, DB: B) Processing trigger + SSE polling

    User->>Browser: Click "Process Book"
    Browser->>NextJS: POST /api/books/:id/process
    NextJS->>Auth: auth() — verify JWT
    Auth-->>NextJS: session
    NextJS->>DB: Fetch API key (encrypted)
    NextJS->>NextJS: Decrypt key, create AbortController
    NextJS->>NextJS: Start runFullProcessing (background)
    NextJS-->>Browser: 200 { message: "Processing started" }

    Browser->>NextJS: GET /api/books/:id/status (EventSource)
    NextJS->>Auth: auth() — verify JWT

    loop Every 2 seconds
        NextJS->>DB: Query book status
        NextJS-->>Browser: SSE data: { status, progress, totalChapters }
    end

    NextJS-->>Browser: SSE data: { status: "completed" }
    NextJS->>NextJS: Close stream
    Browser->>Browser: Reload page
```

---

## Processing State Machine

The `processingStatus` column on the `books` table tracks the lifecycle of AI processing. The enum has five values with the following transitions:

```mermaid
stateDiagram-v2
    [*] --> pending : Book uploaded

    pending --> processing : POST /process triggered

    processing --> completed : All phases finish successfully
    processing --> partial : Error/cancel with some extractions saved + synthesis succeeds
    processing --> failed : Zero extractions or all phases fail

    partial --> processing : User continues processing
    failed --> processing : User retries processing

    note right of partial
        Partial: extractions are persisted
        per-chapter. Entries from completed
        chapters are available (compiled
        incrementally). Resume skips
        already-extracted chapters.
    end note

    note right of processing
        Entries are available during processing
        via incremental compilation after each
        chapter. compiledChapters tracks how
        far entries cover. Cancellation via
        POST /cancel signals abort.
    end note

    completed --> [*]
```

---

## Module Structure

High-level view of how the source directories relate to each other. Arrows indicate dependency direction (imports).

```mermaid
flowchart LR
    subgraph Pages["app/ — Routes & API"]
        APP["(app)/ pages"]
        AUTHPAGES["(auth)/ sign-in"]
        API["api/ routes<br/>process, status, cancel"]
    end

    subgraph Actions["actions/ — Server Actions"]
        SA["books, entries,<br/>progress, api-keys"]
    end

    subgraph Components["components/"]
        BOOKS_C["books/<br/>upload, process,<br/>status, delete"]
        ENTRIES_C["entries/<br/>card, grid, detail,<br/>markdown, source-popover"]
        SETTINGS_C["settings/<br/>api-key form & list"]
    end

    subgraph Processing["lib/processing/"]
        BP["book-processor"]
        CS["chapter-splitter"]
        AR["abort-registry"]
    end

    subgraph AI["lib/ai/"]
        PROV["provider interface"]
        ANTH["anthropic adapter"]
        OAI["openai adapter"]
        PROMPTS["prompts/<br/>extraction,<br/>section-guidelines"]
        VAL["validation"]
    end

    subgraph Data["lib/db/"]
        SCHEMA["schema/<br/>auth, books, entries,<br/>progress, api-keys"]
        REL["relations"]
        SEED["seed"]
    end

    subgraph Util["lib/ utilities"]
        EPUB["epub/<br/>parser, metadata"]
        CRYPTO["crypto/encryption"]
        UTILS["utils/<br/>content-filter,<br/>validation, errors"]
    end

    HOOKS["hooks/<br/>use-processing-status"]
    AUTHMOD["auth.ts<br/>NextAuth config"]

    APP --> SA
    APP --> Components
    API --> Processing
    API --> AUTHMOD
    SA --> Data
    SA --> EPUB
    SA --> AUTHMOD
    Components --> HOOKS
    HOOKS --> API

    Processing --> AI
    Processing --> Data
    AI --> PROV
    ANTH --> PROV
    OAI --> PROV
    AI --> PROMPTS
    AI --> VAL

    BP --> CS
    BP --> AR
    BP --> CRYPTO

    Data --> SCHEMA
    Data --> REL
```
