import { 
  users, 
  botSessions,
  knowledgeBaseArticles,
  supportInteractions,
  type User, 
  type InsertUser,
  type BotSession,
  type InsertBotSession,
  type KnowledgeBaseArticle,
  type InsertKnowledgeBaseArticle,
  type SupportInteraction,
  type InsertSupportInteraction,
} from "@shared/schema.js";

// Storage interface for IT Support Bot
export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Bot session management
  getBotSession(conversationId: string): Promise<BotSession | undefined>;
  createBotSession(session: InsertBotSession): Promise<BotSession>;
  updateBotSession(conversationId: string, sessionData: any): Promise<void>;

  // Knowledge base articles cache
  getKnowledgeBaseArticle(articleId: string): Promise<KnowledgeBaseArticle | undefined>;
  createKnowledgeBaseArticle(article: InsertKnowledgeBaseArticle): Promise<KnowledgeBaseArticle>;
  updateKnowledgeBaseArticle(articleId: string, updates: Partial<KnowledgeBaseArticle>): Promise<void>;
  searchKnowledgeBaseArticles(keywords: string[]): Promise<KnowledgeBaseArticle[]>;

  // Support interactions for analytics
  createSupportInteraction(interaction: InsertSupportInteraction): Promise<SupportInteraction>;
  getSupportInteraction(id: number): Promise<SupportInteraction | undefined>;
  getRecentInteractions(limit: number): Promise<SupportInteraction[]>;
  updateInteractionFeedback(id: number, wasHelpful: boolean): Promise<void>;
  getInteractionsByUserId(userId: string, limit: number): Promise<SupportInteraction[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getBotSession(conversationId: string): Promise<BotSession | undefined> {
    const [session] = await db.select().from(botSessions).where(eq(botSessions.conversationId, conversationId));
    return session || undefined;
  }

  async createBotSession(insertSession: InsertBotSession): Promise<BotSession> {
    const [session] = await db
      .insert(botSessions)
      .values(insertSession)
      .returning();
    return session;
  }

  async updateBotSession(conversationId: string, sessionData: any): Promise<void> {
    await db
      .update(botSessions)
      .set({ sessionData, updatedAt: new Date() })
      .where(eq(botSessions.conversationId, conversationId));
  }

  async getKnowledgeBaseArticle(articleId: string): Promise<KnowledgeBaseArticle | undefined> {
    const [article] = await db.select().from(knowledgeBaseArticles).where(eq(knowledgeBaseArticles.articleId, articleId));
    return article || undefined;
  }

  async createKnowledgeBaseArticle(insertArticle: InsertKnowledgeBaseArticle): Promise<KnowledgeBaseArticle> {
    const [article] = await db
      .insert(knowledgeBaseArticles)
      .values(insertArticle)
      .returning();
    return article;
  }

  async updateKnowledgeBaseArticle(articleId: string, updates: Partial<KnowledgeBaseArticle>): Promise<void> {
    await db
      .update(knowledgeBaseArticles)
      .set(updates)
      .where(eq(knowledgeBaseArticles.articleId, articleId));
  }

  async searchKnowledgeBaseArticles(keywords: string[]): Promise<KnowledgeBaseArticle[]> {
    if (keywords.length === 0) return [];
    
    // Use PostgreSQL full-text search
    const searchConditions = keywords.map(keyword => 
      sql`(${knowledgeBaseArticles.title} ILIKE ${`%${keyword}%`} OR 
           ${knowledgeBaseArticles.content} ILIKE ${`%${keyword}%`} OR 
           ${knowledgeBaseArticles.category} ILIKE ${`%${keyword}%`} OR 
           ${knowledgeBaseArticles.kbproduct} ILIKE ${`%${keyword}%`})`
    );
    
    const articles = await db
      .select()
      .from(knowledgeBaseArticles)
      .where(and(...searchConditions))
      .orderBy(desc(knowledgeBaseArticles.createdAt));
    
    return articles;
  }

  async createSupportInteraction(insertInteraction: InsertSupportInteraction): Promise<SupportInteraction> {
    const [interaction] = await db
      .insert(supportInteractions)
      .values(insertInteraction)
      .returning();
    return interaction;
  }

  async getSupportInteraction(id: number): Promise<SupportInteraction | undefined> {
    const [interaction] = await db.select().from(supportInteractions).where(eq(supportInteractions.id, id));
    return interaction || undefined;
  }

  async getRecentInteractions(limit: number): Promise<SupportInteraction[]> {
    return await db
      .select()
      .from(supportInteractions)
      .orderBy(desc(supportInteractions.createdAt))
      .limit(limit);
  }

  async updateInteractionFeedback(id: number, wasHelpful: boolean): Promise<void> {
    await db
      .update(supportInteractions)
      .set({ wasHelpful })
      .where(eq(supportInteractions.id, id));
  }

  async getInteractionsByUserId(userId: string, limit: number): Promise<SupportInteraction[]> {
    return await db
      .select()
      .from(supportInteractions)
      .where(eq(supportInteractions.userId, userId))
      .orderBy(desc(supportInteractions.createdAt))
      .limit(limit);
  }
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private botSessions: Map<string, BotSession>;
  private knowledgeBaseArticles: Map<string, KnowledgeBaseArticle>;
  private supportInteractions: Map<number, SupportInteraction>;
  private currentUserId: number;
  private currentSessionId: number;
  private currentArticleId: number;
  private currentInteractionId: number;

  constructor() {
    this.users = new Map();
    this.botSessions = new Map();
    this.knowledgeBaseArticles = new Map();
    this.supportInteractions = new Map();
    this.currentUserId = 1;
    this.currentSessionId = 1;
    this.currentArticleId = 1;
    this.currentInteractionId = 1;
  }

  // User management
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Bot session management
  async getBotSession(conversationId: string): Promise<BotSession | undefined> {
    return Array.from(this.botSessions.values()).find(
      session => session.conversationId === conversationId
    );
  }

  async createBotSession(insertSession: InsertBotSession): Promise<BotSession> {
    const id = this.currentSessionId++;
    const now = new Date();
    const session: BotSession = { 
      ...insertSession, 
      id,
      createdAt: now,
      updatedAt: now,
      sessionData: insertSession.sessionData || null,
    };
    this.botSessions.set(insertSession.conversationId, session);
    return session;
  }

  async updateBotSession(conversationId: string, sessionData: any): Promise<void> {
    const existingSession = await this.getBotSession(conversationId);
    if (existingSession) {
      existingSession.sessionData = sessionData;
      existingSession.updatedAt = new Date();
      this.botSessions.set(conversationId, existingSession);
    }
  }

  // Knowledge base articles cache
  async getKnowledgeBaseArticle(articleId: string): Promise<KnowledgeBaseArticle | undefined> {
    return this.knowledgeBaseArticles.get(articleId);
  }

  async createKnowledgeBaseArticle(insertArticle: InsertKnowledgeBaseArticle): Promise<KnowledgeBaseArticle> {
    const id = this.currentArticleId++;
    const article: KnowledgeBaseArticle = { 
      ...insertArticle, 
      id,
      lastUpdated: insertArticle.lastUpdated || null,
      searchKeywords: insertArticle.searchKeywords || null,
      category: insertArticle.category || null,
      isActive: insertArticle.isActive ?? true,
    };
    this.knowledgeBaseArticles.set(insertArticle.articleId, article);
    return article;
  }

  async updateKnowledgeBaseArticle(articleId: string, updates: Partial<KnowledgeBaseArticle>): Promise<void> {
    const existingArticle = this.knowledgeBaseArticles.get(articleId);
    if (existingArticle) {
      Object.assign(existingArticle, updates);
      this.knowledgeBaseArticles.set(articleId, existingArticle);
    }
  }

  async searchKnowledgeBaseArticles(keywords: string[]): Promise<KnowledgeBaseArticle[]> {
    const articles = Array.from(this.knowledgeBaseArticles.values());
    
    return articles.filter(article => {
      if (!article.isActive) return false;
      
      const searchText = (
        article.title + ' ' + 
        article.content + ' ' + 
        (article.searchKeywords?.join(' ') || '') + ' ' +
        (article.category || '')
      ).toLowerCase();
      
      return keywords.some(keyword => 
        searchText.includes(keyword.toLowerCase())
      );
    });
  }

  // Support interactions for analytics
  async createSupportInteraction(insertInteraction: InsertSupportInteraction): Promise<SupportInteraction> {
    const id = this.currentInteractionId++;
    const interaction: SupportInteraction = { 
      ...insertInteraction, 
      id,
      createdAt: new Date(),
      generatedKeywords: insertInteraction.generatedKeywords || null,
      foundArticles: insertInteraction.foundArticles || null,
      responseTime: insertInteraction.responseTime || null,
      wasHelpful: insertInteraction.wasHelpful || null,
    };
    this.supportInteractions.set(id, interaction);
    return interaction;
  }

  async getSupportInteraction(id: number): Promise<SupportInteraction | undefined> {
    return this.supportInteractions.get(id);
  }

  async getRecentInteractions(limit: number): Promise<SupportInteraction[]> {
    const interactions = Array.from(this.supportInteractions.values());
    return interactions
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
  }

  async updateInteractionFeedback(id: number, wasHelpful: boolean): Promise<void> {
    const interaction = this.supportInteractions.get(id);
    if (interaction) {
      interaction.wasHelpful = wasHelpful;
      this.supportInteractions.set(id, interaction);
    }
  }

  async getInteractionsByUserId(userId: string, limit: number): Promise<SupportInteraction[]> {
    const interactions = Array.from(this.supportInteractions.values());
    return interactions
      .filter(interaction => interaction.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
  }
}

export const storage = new MemStorage();
