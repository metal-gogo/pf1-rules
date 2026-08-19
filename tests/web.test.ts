import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLocalPrisma } from "../src/db/client.js";
import { createRequestHandler } from "../src/web/server.js";


const prisma = createLocalPrisma();
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(createRequestHandler(prisma));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

describe("local rules browser", () => {
  it("renders semantic navigation and database counts", async () => {
    const response = await fetch(baseUrl);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<nav aria-label="Primary navigation">');
    expect(html).toContain('<main id="content">');
    expect(html).toContain("Database summary");
  });

  it("renders a spell with local relationship and source links", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.light`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<h1>Light</h1>");
    expect(html).toContain("/lists/spell-list.cleric");
    expect(html).toContain("/entities/spell.permanency");
    expect(html).toContain("/sources/");
  });

  it("supports search without client-side JavaScript", async () => {
    const response = await fetch(`${baseUrl}/search?q=afflictions`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('form action="/search" method="get"');
    expect(html).toContain("Wish");
    expect(html).toContain("#mythic");
  });

  it("renders sourced definitions for resolved non-spell entities", async () => {
    const response = await fetch(`${baseUrl}/entities/action.immediate-action`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<dt>Status</dt><dd>resolved</dd>");
    expect(html).toContain("<h2>Definition</h2>");
    expect(html).toContain("can be performed at any time");
    expect(html).toContain("legacy_aon");
  });

  it("returns an accessible not-found page", async () => {
    const response = await fetch(`${baseUrl}/spells/does-not-exist`);
    const html = await response.text();
    expect(response.status).toBe(404);
    expect(html).toContain("<h1>Page not found</h1>");
  });
});
