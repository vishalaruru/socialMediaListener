import { PrismaClient } from '@prisma/client';

[
  { datasourceUrl: "file:./dev.db" },
  { url: "file:./dev.db" },
  { datasources: { db: { url: "file:./dev.db" } } },
  { db: { url: "file:./dev.db" } },
  { __internal: { engine: { endpoint: "file:./dev.db" } } },
  { adapter: null },
  { url: "abc", adapter: null }
].forEach(opt => {
  try {
    const p = new PrismaClient(opt as any);
    console.log("SUCCESS:", JSON.stringify(opt));
  } catch(e: any) {
    console.log("FAILED:", JSON.stringify(opt), e.message.split('\n')[0]);
  }
});
