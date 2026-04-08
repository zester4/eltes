import { tool } from "ai";
import { Redis } from "@upstash/redis";
import { z } from "zod";
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

function scoreEntity(entity: GraphEntity, q: string): number {
  const query = q.toLowerCase();
  let score = 0;

  if (entity.name.toLowerCase().includes(query)) score += 5;
  if (entity.entityType.toLowerCase().includes(query)) score += 3;
  if (entity.summary.toLowerCase().includes(query)) score += 3;
  for (const alias of entity.aliases) {
    if (alias.toLowerCase().includes(query)) score += 2;
  }
  for (const tag of entity.tags) {
    if (tag.toLowerCase().includes(query)) score += 1;
  }
  for (const fact of entity.facts) {
    if (fact.toLowerCase().includes(query)) score += 2;
  }
  return score;
}

export const upsertKnowledgeEntity = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Add or update a knowledge-graph entity for this user. " +
      "Use for people, projects, companies, goals, tools, constraints, systems, and concepts.",
    inputSchema: z.object({
      entityId: z.string().optional(),
      name: z.string(),
      entityType: z.string().default("concept"),
      summary: z.string().default(""),
      tags: z.array(z.string()).optional().default([]),
      aliases: z.array(z.string()).optional().default([]),
      facts: z.array(z.string()).optional().default([]),
    }),
    execute: async ({
      entityId,
      name,
      entityType,
      summary,
      tags,
      aliases,
      facts,
    }) => {
      const redis = getRedis();
      if (!redis) return { success: false, error: "Redis is not configured." };

      const now = new Date().toISOString();
      const id = entityId ?? generateUUID();

      const existingRaw = await redis.get<string>(entityKey(userId, id));
      const existing =
        typeof existingRaw === "string"
          ? (JSON.parse(existingRaw) as GraphEntity)
          : ((existingRaw as GraphEntity | null) ?? null);

      const entity: GraphEntity = {
        id,
        name,
        entityType,
        summary,
        tags,
        aliases,
        facts,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      await redis.set(entityKey(userId, id), JSON.stringify(entity));
      await redis.sadd(entitySetKey(userId), id);

      return {
        success: true,
        entity,
      };
    },
  });

export const addKnowledgeRelation = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Create a typed edge between two knowledge-graph entities. " +
      "Examples: depends_on, owns, blocked_by, collaborates_with, supports.",
    inputSchema: z.object({
      relationId: z.string().optional(),
      fromEntityId: z.string(),
      toEntityId: z.string(),
      relationType: z.string(),
      weight: z.number().min(0).max(1).optional().default(0.7),
      evidence: z.string().optional(),
    }),
    execute: async ({
      relationId,
      fromEntityId,
      toEntityId,
      relationType,
      weight,
      evidence,
    }) => {
      const redis = getRedis();
      if (!redis) return { success: false, error: "Redis is not configured." };

      const [fromRaw, toRaw] = await Promise.all([
        redis.get(entityKey(userId, fromEntityId)),
        redis.get(entityKey(userId, toEntityId)),
      ]);
      if (!fromRaw || !toRaw) {
        return {
          success: false,
          error: "Both entities must exist before adding a relation.",
        };
      }

      const id = relationId ?? generateUUID();
      const relation: GraphRelation = {
        id,
        fromEntityId,
        toEntityId,
        relationType,
        weight,
        evidence,
        createdAt: new Date().toISOString(),
      };

      await Promise.all([
        redis.set(relationKey(userId, id), JSON.stringify(relation)),
        redis.sadd(relationSetKey(userId), id),
        redis.sadd(outKey(userId, fromEntityId), id),
        redis.sadd(inKey(userId, toEntityId), id),
      ]);

      return { success: true, relation };
    },
  });

export const getKnowledgeEntity = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Fetch one entity and optionally include incoming/outgoing relations.",
    inputSchema: z.object({
      entityId: z.string(),
      includeRelations: z.boolean().optional().default(true),
    }),
    execute: async ({ entityId, includeRelations }) => {
      const redis = getRedis();
      if (!redis) return { success: false, error: "Redis is not configured." };

      const raw = await redis.get<string>(entityKey(userId, entityId));
      if (!raw) return { success: false, error: "Entity not found." };

      const entity =
        typeof raw === "string"
          ? (JSON.parse(raw) as GraphEntity)
          : (raw as GraphEntity);

      if (!includeRelations) return { success: true, entity };

      const [outIds, inIds] = await Promise.all([
        redis.smembers<string[]>(outKey(userId, entityId)),
        redis.smembers<string[]>(inKey(userId, entityId)),
      ]);

      const uniqueRelationIds = [...new Set([...(outIds ?? []), ...(inIds ?? [])])];
      const relations: GraphRelation[] = [];

      for (const rid of uniqueRelationIds) {
        const relRaw = await redis.get<string>(relationKey(userId, rid));
        if (!relRaw) continue;
        const parsed =
          typeof relRaw === "string"
            ? (JSON.parse(relRaw) as GraphRelation)
            : (relRaw as GraphRelation);
        relations.push(parsed);
      }

      return { success: true, entity, relations };
    },
  });

export const searchKnowledgeGraph = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Search entities in the user's knowledge graph by name/type/summary/tags/facts.",
    inputSchema: z.object({
      query: z.string(),
      entityType: z.string().optional(),
      tag: z.string().optional(),
      limit: z.number().optional().default(10),
    }),
    execute: async ({ query, entityType, tag, limit }) => {
      const redis = getRedis();
      if (!redis) return { success: false, error: "Redis is not configured." };

      const entityIds = await redis.smembers<string[]>(entitySetKey(userId));
      const entities: GraphEntity[] = [];

      for (const id of entityIds ?? []) {
        const raw = await redis.get<string>(entityKey(userId, id));
        if (!raw) continue;
        const entity =
          typeof raw === "string"
            ? (JSON.parse(raw) as GraphEntity)
            : (raw as GraphEntity);
        if (entityType && entity.entityType !== entityType) continue;
        if (tag && !entity.tags.includes(tag)) continue;
        const score = scoreEntity(entity, query);
        if (score <= 0) continue;
        entities.push(entity);
      }

      const ranked = entities
        .sort((a, b) => scoreEntity(b, query) - scoreEntity(a, query))
        .slice(0, limit);

      return { success: true, results: ranked, count: ranked.length };
    },
  });

export const deleteKnowledgeEntity = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Delete an entity and optionally remove all connected relations.",
    inputSchema: z.object({
      entityId: z.string(),
      deleteRelations: z.boolean().optional().default(true),
    }),
    execute: async ({ entityId, deleteRelations }) => {
      const redis = getRedis();
      if (!redis) return { success: false, error: "Redis is not configured." };

      await redis.del(entityKey(userId, entityId));
      await redis.srem(entitySetKey(userId), entityId);

      if (deleteRelations) {
        const [outIds, inIds] = await Promise.all([
          redis.smembers<string[]>(outKey(userId, entityId)),
          redis.smembers<string[]>(inKey(userId, entityId)),
        ]);
        const relationIds = [...new Set([...(outIds ?? []), ...(inIds ?? [])])];
        for (const rid of relationIds) {
          const raw = await redis.get<string>(relationKey(userId, rid));
          if (!raw) continue;
          const rel =
            typeof raw === "string"
              ? (JSON.parse(raw) as GraphRelation)
              : (raw as GraphRelation);
          await Promise.all([
            redis.del(relationKey(userId, rid)),
            redis.srem(relationSetKey(userId), rid),
            redis.srem(outKey(userId, rel.fromEntityId), rid),
            redis.srem(inKey(userId, rel.toEntityId), rid),
          ]);
        }
      }

      await Promise.all([
        redis.del(outKey(userId, entityId)),
        redis.del(inKey(userId, entityId)),
      ]);

      return { success: true, message: `Deleted entity ${entityId}.` };
    },
  });

export const deleteKnowledgeRelation = ({ userId }: { userId: string }) =>
  tool({
    description: "Delete a specific relation edge from the knowledge graph.",
    inputSchema: z.object({
      relationId: z.string(),
    }),
    execute: async ({ relationId }) => {
      const redis = getRedis();
      if (!redis) return { success: false, error: "Redis is not configured." };

      const raw = await redis.get<string>(relationKey(userId, relationId));
      if (!raw) return { success: false, error: "Relation not found." };

      const rel =
        typeof raw === "string"
          ? (JSON.parse(raw) as GraphRelation)
          : (raw as GraphRelation);

      await Promise.all([
        redis.del(relationKey(userId, relationId)),
        redis.srem(relationSetKey(userId), relationId),
        redis.srem(outKey(userId, rel.fromEntityId), relationId),
        redis.srem(inKey(userId, rel.toEntityId), relationId),
      ]);

      return { success: true, message: `Deleted relation ${relationId}.` };
    },
  });
