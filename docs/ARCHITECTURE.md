# Chronicle Architecture

Chronicle is a progress-locked reading companion that processes ePub books through an AI pipeline, producing encyclopedia-style entries (characters, locations, themes, etc.) that are filtered by how far the reader has progressed. This document provides visual diagrams of the system's architecture.

---

## Database Schema

The database has 10 tables split across four domains: authentication (managed by Auth.js/Drizzle adapter), books & chapters, AI-generated entries with supporting data, and user state (reading progress & API keys). All foreign keys cascade on delete from their parent.

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
        text name
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
        integer chapterNumber
        text summary
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
    books ||--o{ reading_progress : "tracked in"
    entries ||--o{ entry_quotes : "has"
    entries ||--o{ entry_sources : "has"
```

---

## Book Processing Pipeline

When a user triggers processing, the system runs a multi-phase pipeline in the background. An `AbortController` allows cancellation at any checkpoint. Large chapters are automatically split into chunks. Extraction uses a two-step approach: structure discovery identifies subjects and paragraph references, then detail extraction runs in parallel batches grouped by paragraph locality (subjects referencing nearby text share a batch, eliminating duplicate input tokens). Synthesis also runs in parallel (5 concurrent).

```mermaid
flowchart TD
    A[User clicks Process] --> B[POST /api/books/:id/process]
    B --> C{Auth + API key valid?}
    C -- No --> D[Return error]
    C -- Yes --> E[Create AbortController]
    E --> F[Start background via after]
    F --> G[Set status = processing]

    subgraph Extraction["Phase 1: Multi-Pass Extraction (cheap model)"]
        G --> H[Load all chapters from DB]
        H --> I[For each chapter — sequential]
        I --> J{Chapter too large?}
        J -- Yes --> K[Split into chunks]
        J -- No --> L1

        subgraph PerChunk["Per chunk/chapter"]
            L1[Step 1: Number paragraphs]
            L1 --> L2[Step 2: Structure discovery<br/>subjects + paragraph refs + significance]
            L2 --> L3[Step 3: Batch by paragraph locality<br/>sort by centroid, pack to output budget]
            L3 --> L4[Step 3: Detail extraction<br/>parallel ×3, dynamic maxTokens<br/>aliases, tags, observations, quotes]
        end

        K --> L1
        L4 --> M2[Update manifest + processingProgress]
        M2 --> P{More chapters?}
        P -- Yes --> Q{Aborted?}
        Q -- No --> I
        Q -- Yes --> CANCEL[Set status = failed<br/>error: Cancelled by user]
        P -- No --> R{Aborted?}
        R -- Yes --> CANCEL
    end

    subgraph Summaries["Phase 1b: Chapter Summaries"]
        R -- No --> R2[Insert chapter_summaries]
    end

    subgraph Grouping["Phase 2: Entity Grouping"]
        R2 --> S[Deduplicate entity names]
        S --> T[Group observations by canonical entity<br/>significance = max across chapters]
    end

    subgraph Synthesis["Phase 3: Synthesis (full model, parallel ×5)"]
        T --> U[For each grouped entity — parallel ×5]
        U --> V{Aborted?}
        V -- Yes --> CANCEL
        V -- No --> W[Generate encyclopedia entry]
        W --> X[Insert entry + sources + quotes]
        X --> Y{More entities?}
        Y -- Yes --> U
    end

    Y -- No --> AB[Set status = completed]
    AB --> AC[Log token usage summary]
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

The `processingStatus` column on the `books` table tracks the lifecycle of AI processing. The enum has four values with the following transitions:

```mermaid
stateDiagram-v2
    [*] --> pending : Book uploaded

    pending --> processing : POST /process triggered

    processing --> completed : All phases finish successfully
    processing --> failed : Unhandled error thrown

    failed --> processing : User retries processing

    note right of processing
        Cancellation: POST /cancel sets
        status to failed with
        error "Cancelled by user"
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
        PROMPTS["prompts/<br/>extraction, synthesis,<br/>section-guidelines"]
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
