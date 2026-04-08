import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { auth } from "@/app/(auth)/auth";
import { generateUUID } from "@/lib/utils";

type GraphEntity = {
  id: string;
  name: string;
  entityType: string;
  summary: string;
  tags: string[];
  aliases: string[];
  facts: string[];
  createdAt: string;
  updatedAt: string;
};

type GraphRelation = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: string;
  weight: number;
  evidence?: string;
  createdAt: string;
};

function getRedis() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function entityKey(userId: string, entityId: string) {
  return `kg:${userId}:entity:${entityId}`;
}
function relationKey(userId: string, relationId: string) {
  return `kg:${userId}:relation:${relationId}`;
}
function entitySetKey(userId: string) {
  return `kg:${userId}:entities`;
}
function relationSetKey(userId: string) {
  return `kg:${userId}:relations`;
}
function outKey(userId: string, entityId: string) {
  return `kg:${userId}:out:${entityId}`;
}
function inKey(userId: string, entityId: string) {
  return `kg:${userId}:in:${entityId}`;
}

async function parseEntity(redis: Redis, userId: string, entityId: string) {
  const raw = await redis.get<string>(entityKey(userId, entityId));
  if (!raw) return null;
  return typeof raw === "string"
    ? (JSON.parse(raw) as GraphEntity)
    : (raw as GraphEntity);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis unavailable" }, { status: 503 });
  }

  const entityId = req.nextUrl.searchParams.get("entityId");
  if (entityId) {
    const entity = await parseEntity(redis, session.user.id, entityId);
    if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [outIds, inIds] = await Promise.all([
      redis.smembers<string[]>(outKey(session.user.id, entityId)),
      redis.smembers<string[]>(inKey(session.user.id, entityId)),
    ]);
    const relationIds = [...new Set([...(outIds ?? []), ...(inIds ?? [])])];
    const relations: GraphRelation[] = [];
    for (const rid of relationIds) {
      const raw = await redis.get<string>(relationKey(session.user.id, rid));
      if (!raw) continue;
      relations.push(
        typeof raw === "string"
          ? (JSON.parse(raw) as GraphRelation)
          : (raw as GraphRelation),
      );
    }
    return NextResponse.json({ entity, relations });
  }

  const entityIds = await redis.smembers<string[]>(entitySetKey(session.user.id));
  const entities: GraphEntity[] = [];
  for (const id of entityIds ?? []) {
    const entity = await parseEntity(redis, session.user.id, id);
    if (entity) entities.push(entity);
  }
  entities.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return NextResponse.json({ entities });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis unavailable" }, { status: 503 });
  }

  const body = (await req.json()) as
    | { kind?: "entity"; entity?: Partial<GraphEntity> }
    | { kind?: "relation"; relation?: Partial<GraphRelation> };

  if (body.kind === "relation") {
    const rel = body.relation;
    if (!rel?.fromEntityId || !rel.toEntityId || !rel.relationType) {
      return NextResponse.json({ error: "Missing relation fields" }, { status: 400 });
    }
    const relation: GraphRelation = {
      id: rel.id ?? generateUUID(),
      fromEntityId: rel.fromEntityId,
      toEntityId: rel.toEntityId,
      relationType: rel.relationType,
      weight: rel.weight ?? 0.7,
      evidence: rel.evidence,
      createdAt: new Date().toISOString(),
    };
    await Promise.all([
      redis.set(
        relationKey(session.user.id, relation.id),
        JSON.stringify(relation),
      ),
      redis.sadd(relationSetKey(session.user.id), relation.id),
      redis.sadd(outKey(session.user.id, relation.fromEntityId), relation.id),
      redis.sadd(inKey(session.user.id, relation.toEntityId), relation.id),
    ]);
    return NextResponse.json({ relation });
  }

  const entityInput =
    (body as { entity?: Partial<GraphEntity> }).entity ?? ({} as Partial<GraphEntity>);
  if (!entityInput.name) {
    return NextResponse.json({ error: "Missing entity name" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const entity: GraphEntity = {
    id: entityInput.id ?? generateUUID(),
    name: entityInput.name,
    entityType: entityInput.entityType ?? "concept",
    summary: entityInput.summary ?? "",
    tags: entityInput.tags ?? [],
    aliases: entityInput.aliases ?? [],
    facts: entityInput.facts ?? [],
    createdAt: entityInput.createdAt ?? now,
    updatedAt: now,
  };
  await Promise.all([
    redis.set(entityKey(session.user.id, entity.id), JSON.stringify(entity)),
    redis.sadd(entitySetKey(session.user.id), entity.id),
  ]);
  return NextResponse.json({ entity });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis unavailable" }, { status: 503 });
  }

  const entityId = req.nextUrl.searchParams.get("entityId");
  const relationId = req.nextUrl.searchParams.get("relationId");

  if (relationId) {
    const relRaw = await redis.get<string>(relationKey(session.user.id, relationId));
    if (relRaw) {
      const rel =
        typeof relRaw === "string"
          ? (JSON.parse(relRaw) as GraphRelation)
          : (relRaw as GraphRelation);
      await Promise.all([
        redis.del(relationKey(session.user.id, relationId)),
        redis.srem(relationSetKey(session.user.id), relationId),
        redis.srem(outKey(session.user.id, rel.fromEntityId), relationId),
        redis.srem(inKey(session.user.id, rel.toEntityId), relationId),
      ]);
    }
    return NextResponse.json({ ok: true });
  }

  if (entityId) {
    const [outIds, inIds] = await Promise.all([
      redis.smembers<string[]>(outKey(session.user.id, entityId)),
      redis.smembers<string[]>(inKey(session.user.id, entityId)),
    ]);
    for (const rid of [...new Set([...(outIds ?? []), ...(inIds ?? [])])]) {
      await Promise.all([
        redis.del(relationKey(session.user.id, rid)),
        redis.srem(relationSetKey(session.user.id), rid),
      ]);
    }
    await Promise.all([
      redis.del(entityKey(session.user.id, entityId)),
      redis.srem(entitySetKey(session.user.id), entityId),
      redis.del(outKey(session.user.id, entityId)),
      redis.del(inKey(session.user.id, entityId)),
    ]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "Provide entityId or relationId" },
    { status: 400 },
  );
}
