import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const botSessions = pgTable("bot_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  channelId: text("channel_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  sessionData: jsonb("session_data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const knowledgeBaseArticles = pgTable("knowledge_base_articles", {
  id: serial("id").primaryKey(),
  articleId: text("article_id").notNull().unique(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  url: text("url").notNull(),
  tags: text("tags").array(),
  lastUpdated: timestamp("last_updated"),
  searchKeywords: text("search_keywords").array(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  kbIsPrivate: boolean("kb_is_private").default(false),
  kbStatus: integer("kb_status").default(2),
});

export const supportInteractions = pgTable("support_interactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  userQuery: text("user_query").notNull(),
  generatedKeywords: text("generated_keywords").array(),
  foundArticles: jsonb("found_articles"),
  aiResponse: text("ai_response").notNull(),
  responseTime: integer("response_time"), // in milliseconds
  wasHelpful: boolean("was_helpful"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertBotSessionSchema = createInsertSchema(botSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKnowledgeBaseArticleSchema = createInsertSchema(knowledgeBaseArticles).omit({
  id: true,
});

export const insertSupportInteractionSchema = createInsertSchema(supportInteractions).omit({
  id: true,
  createdAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type BotSession = typeof botSessions.$inferSelect;
export type InsertBotSession = z.infer<typeof insertBotSessionSchema>;
export type KnowledgeBaseArticle = typeof knowledgeBaseArticles.$inferSelect;
export type InsertKnowledgeBaseArticle = z.infer<typeof insertKnowledgeBaseArticleSchema>;
export type SupportInteraction = typeof supportInteractions.$inferSelect;
export type InsertSupportInteraction = z.infer<typeof insertSupportInteractionSchema>;
