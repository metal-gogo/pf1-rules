import type { PrismaClient } from "../generated/prisma/client.js";


export async function findSpell(prisma: PrismaClient, nameOrId: string) {
  return prisma.canonicalSpell.findFirst({
    where: {
      OR: [{ spellId: nameOrId }, { name: { equals: nameOrId } }],
    },
    include: {
      aliases: true,
      descriptors: true,
      levels: { orderBy: [{ spellLevel: "asc" }, { listName: "asc" }] },
      components: { orderBy: [{ componentScope: "asc" }, { componentIndex: "asc" }] },
      deliveryFields: { orderBy: { fieldIndex: "asc" } },
      descriptionSections: { orderBy: { sectionIndex: "asc" } },
      inheritance: true,
      mythicVariant: { include: { augmentations: true } },
    },
  });
}


export async function searchRules(prisma: PrismaClient, query: string) {
  const [spells, variants] = await Promise.all([
    prisma.canonicalSpell.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { searchText: { contains: query } },
          { descriptionRaw: { contains: query } },
        ],
      },
      select: { spellId: true, name: true, school: true, searchText: true },
      orderBy: { name: "asc" },
      take: 25,
    }),
    prisma.mythicSpellVariant.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { searchText: { contains: query } },
          { rulesRaw: { contains: query } },
        ],
      },
      select: { id: true, name: true, baseSpellId: true, searchText: true },
      orderBy: { name: "asc" },
      take: 25,
    }),
  ]);
  return { spells, mythicVariants: variants };
}


export async function spellsForList(
  prisma: PrismaClient,
  spellListId: string,
  spellLevel?: number,
) {
  return prisma.spellLevel.findMany({
    where: {
      spellListId,
      ...(spellLevel === undefined ? {} : { spellLevel }),
    },
    include: { spell: true },
    orderBy: [{ spellLevel: "asc" }, { spell: { name: "asc" } }],
  });
}


export async function ingestionQueueSummary(
  prisma: PrismaClient,
  catalogLevel = 0,
) {
  const items = await prisma.ingestionQueueItem.findMany({
    where: { catalogLevel },
    select: { status: true, batchNumber: true },
    orderBy: [{ batchNumber: "asc" }],
  });
  const byStatus: Record<string, number> = {};
  const batches = new Map<number, { total: number; ingested: number; issues: number }>();
  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    const batch = batches.get(item.batchNumber) ?? { total: 0, ingested: 0, issues: 0 };
    batch.total += 1;
    if (item.status === "ingested") batch.ingested += 1;
    if (item.status.endsWith("_issue")) batch.issues += 1;
    batches.set(item.batchNumber, batch);
  }
  return {
    level: catalogLevel,
    total: items.length,
    byStatus,
    batches: [...batches].map(([batch, counts]) => ({ batch, ...counts })),
  };
}


export async function listIngestionQueue(
  prisma: PrismaClient,
  options: { batchNumber?: number; status?: string; issuesOnly?: boolean } = {},
) {
  const items = await prisma.ingestionQueueItem.findMany({
    where: {
      catalogLevel: 0,
      ...(options.batchNumber === undefined ? {} : { batchNumber: options.batchNumber }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.issuesOnly ? { issueKind: { not: null } } : {}),
    },
    select: {
      entityId: true,
      entityName: true,
      status: true,
      batchNumber: true,
      priority: true,
      issueKind: true,
      lastError: true,
      sourceUrl: true,
      catalogMemberships: true,
    },
    orderBy: [{ priority: "asc" }, { entityName: "asc" }],
  });
  return items.map(({ catalogMemberships, ...item }) => ({
    ...item,
    spellLists: (catalogMemberships as Array<{ list_name: string }>).map(
      (membership) => membership.list_name,
    ),
  }));
}
