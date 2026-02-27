import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  users,
  books,
  chapters,
  entries,
  entryQuotes,
  entrySources,
  entryConnections,
  readingProgress,
} from "./schema";

async function seed() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client, { casing: "snake_case" });

  console.log("Seeding database...");

  // Create test user
  const [testUser] = await db
    .insert(users)
    .values({
      id: "test-user-001",
      name: "Test Reader",
      email: "test@chronicle.dev",
    })
    .onConflictDoNothing()
    .returning();

  const userId = testUser?.id ?? "test-user-001";

  // Create a sample book
  const [sampleBook] = await db
    .insert(books)
    .values({
      id: "sample-book-001",
      title: "The Great Gatsby",
      author: "F. Scott Fitzgerald",
      description: "A story of wealth, love, and the American Dream in the 1920s.",
      totalChapters: 9,
      processingStatus: "completed",
      processingProgress: 9,
      uploadedBy: userId,
    })
    .onConflictDoNothing()
    .returning();

  if (!sampleBook) {
    console.log("Seed data already exists, skipping.");
    await client.end();
    return;
  }

  // Create sample chapters
  const chapterData = [
    { title: "Chapter 1", content: "In my younger and more vulnerable years my father gave me some advice..." },
    { title: "Chapter 2", content: "About half way between West Egg and New York..." },
    { title: "Chapter 3", content: "There was music from my neighbor's house through the summer nights..." },
    { title: "Chapter 4", content: "On Sunday morning while church bells rang..." },
    { title: "Chapter 5", content: "When I came home to West Egg that night..." },
  ];

  for (let i = 0; i < chapterData.length; i++) {
    await db.insert(chapters).values({
      bookId: sampleBook.id,
      chapterNumber: i + 1,
      title: chapterData[i].title,
      content: chapterData[i].content,
      wordCount: chapterData[i].content.split(/\s+/).length,
    });
  }

  // Create sample entries
  const [gatsbyEntry] = await db
    .insert(entries)
    .values({
      id: "entry-gatsby-001",
      bookId: sampleBook.id,
      name: "Jay Gatsby",
      type: "character",
      aliases: ["Gatsby", "James Gatz"],
      firstAppearanceChapter: 1,
      content: `**Jay Gatsby** · Character
*Wealthy neighbor of Nick Carraway in West Egg*

## At a Glance
A mysteriously wealthy man who throws extravagant parties at his West Egg mansion but is rarely seen at them himself.

<!-- chapter:1 -->
## What We Know
- Lives in a sprawling Gothic mansion next to Nick's cottage
- Throws lavish parties every weekend

<!-- chapter:3 -->
## What We Know (continued)
- Almost no one who attends his parties has actually met him
- Speaks with an affected formality, frequently calling people "old sport"

<!-- chapter:5 -->
## Actions & Choices
- Arrived at Nick's cottage for the tea with Daisy looking pale and terrified
- Insisted on showing Daisy his house, his garden, his shirts`,
      isPublic: true,
      generatedBy: userId,
    })
    .returning();

  const [nickEntry] = await db
    .insert(entries)
    .values({
      id: "entry-nick-001",
      bookId: sampleBook.id,
      name: "Nick Carraway",
      type: "character",
      aliases: ["Nick"],
      firstAppearanceChapter: 1,
      content: `**Nick Carraway** · Character
*The narrator, a bond salesman from Minnesota living in West Egg*

## At a Glance
A Yale-educated Midwesterner who moves to New York's West Egg in the summer of 1922 to learn the bond business.

<!-- chapter:1 -->
## What We Know
- From a prominent Minnesota family
- Rents a small cottage in West Egg next to Gatsby's mansion
- Cousin of Daisy Buchanan`,
      isPublic: true,
      generatedBy: userId,
    })
    .returning();

  const [westEggEntry] = await db
    .insert(entries)
    .values({
      id: "entry-westegg-001",
      bookId: sampleBook.id,
      name: "West Egg",
      type: "location",
      firstAppearanceChapter: 1,
      content: `**West Egg** · Location
*A fictional village on Long Island representing new money*

## At a Glance
The less fashionable of the two egg-shaped peninsulas on Long Island, home to the newly rich.

<!-- chapter:1 -->
## Description
- Located on Long Island Sound, across the bay from East Egg
- Home to Gatsby's mansion and Nick's cottage
- Represents "new money" in contrast to East Egg's old wealth`,
      isPublic: true,
      generatedBy: userId,
    })
    .returning();

  // Create entry sources
  await db.insert(entrySources).values([
    {
      entryId: gatsbyEntry.id,
      chapter: 1,
      observation: "Lives in a sprawling Gothic mansion next to Nick's cottage",
      excerpt:
        "The one on my right was a colossal affair by any standard — it was a factual imitation of some Hotel de Ville in Normandy.",
      searchHint: "colossal affair by any standard factual imitation Hotel de Ville",
      sectionHeading: "What We Know",
      sortOrder: 0,
    },
    {
      entryId: gatsbyEntry.id,
      chapter: 3,
      observation: "Throws lavish parties every weekend that attract hundreds of strangers",
      excerpt:
        "There was music from my neighbor's house through the summer nights. In his blue gardens men and girls came and went like moths among the whisperings and the champagne and the stars.",
      searchHint: "blue gardens men and girls came and went like moths",
      sectionHeading: "What We Know",
      sortOrder: 1,
    },
  ]);

  // Create entry quotes
  await db.insert(entryQuotes).values([
    {
      entryId: gatsbyEntry.id,
      text: "He stretched out his arms toward the dark water in a curious way, and, far as I was from him, I could have sworn he was trembling.",
      speaker: "narrator",
      context: "Nick observes Gatsby for the first time, reaching toward the green light across the bay.",
      chapter: 1,
    },
  ]);

  // Create entry connections
  await db.insert(entryConnections).values([
    {
      sourceEntryId: gatsbyEntry.id,
      targetEntryId: nickEntry.id,
      description: "Neighbor and eventual confidant. Gatsby cultivates the friendship.",
      chapter: 1,
    },
    {
      sourceEntryId: nickEntry.id,
      targetEntryId: westEggEntry.id,
      description: "Nick rents a cottage in West Egg next to Gatsby's mansion.",
      chapter: 1,
    },
  ]);

  // Set reading progress
  await db.insert(readingProgress).values({
    userId,
    bookId: sampleBook.id,
    currentChapter: 3,
  });

  console.log("Seed complete!");
  await client.end();
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
