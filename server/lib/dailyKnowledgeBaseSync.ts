import { db } from "../db";
import { knowledgeBaseArticles } from "@shared/schema";
import { eq, and, or, isNull, lt } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface AteraArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  lastUpdated?: Date;
  kbproduct: string;
  kbIsPrivate: boolean;
  kbStatus: number;
  url: string;
}

interface SyncStats {
  lastSyncTime: Date;
  articlesChecked: number;
  articlesUpdated: number;
  articlesAdded: number;
  keywordsGenerated: number;
  totalArticles: number;
  errors: string[];
}

export class DailyKnowledgeBaseSync {
  private baseUrl = 'https://app.atera.com/api/v3/knowledgebases';
  private syncIntervalHours = 24; // Run every 24 hours

  async startAutoSync(): Promise<void> {
    console.log('🔄 Starting automated daily knowledge base sync...');
    
    // Run initial sync
    await this.performDailySync();
    
    // Schedule recurring sync every 24 hours
    setInterval(async () => {
      try {
        await this.performDailySync();
      } catch (error) {
        console.error('❌ Error in scheduled sync:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, this.syncIntervalHours * 60 * 60 * 1000);
  }

  async performDailySync(): Promise<SyncStats> {
    console.log('🚀 Starting daily knowledge base synchronization...');
    
    const syncStartTime = new Date();
    let stats: SyncStats = {
      lastSyncTime: syncStartTime,
      articlesChecked: 0,
      articlesUpdated: 0,
      articlesAdded: 0,
      keywordsGenerated: 0,
      totalArticles: 0,
      errors: []
    };

    try {
      // Step 1: Fetch all articles from Atera API
      console.log('📥 Fetching articles from Atera API...');
      const allAteraArticles = await this.fetchAllAteraArticles();
      console.log(`Found ${allAteraArticles.length} total articles from Atera`);

      // Step 2: Filter for quality articles (public + published only)
      const qualityArticles = this.filterQualityArticles(allAteraArticles);
      console.log(`Filtered to ${qualityArticles.length} quality articles (public + published)`);
      stats.articlesChecked = qualityArticles.length;

      // Step 3: Get existing articles from database
      const existingArticles = await db.select().from(knowledgeBaseArticles);
      const existingArticleIds = new Set(existingArticles.map(a => a.articleId));

      // Step 4: Process each article (add/update + generate keywords)
      for (const ateraArticle of qualityArticles) {
        try {
          if (existingArticleIds.has(ateraArticle.id)) {
            // Update existing article
            const updated = await this.updateExistingArticle(ateraArticle);
            if (updated) stats.articlesUpdated++;
          } else {
            // Add new article
            await this.addNewArticle(ateraArticle);
            stats.articlesAdded++;
          }
        } catch (error) {
          console.error(`❌ Error processing article ${ateraArticle.id}:`, error);
          stats.errors.push(`Failed to process article ${ateraArticle.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Step 5: Generate/update search keywords for articles without them
      console.log('🧠 Generating search keywords for articles...');
      const keywordsGenerated = await this.generateMissingKeywords();
      stats.keywordsGenerated = keywordsGenerated;

      // Step 6: Clean up removed articles
      await this.cleanupRemovedArticles(qualityArticles.map(a => a.id));

      // Final stats
      const finalCount = await db.select().from(knowledgeBaseArticles);
      stats.totalArticles = finalCount.length;

      console.log('✅ Daily sync completed successfully:', {
        duration: `${Date.now() - syncStartTime.getTime()}ms`,
        articlesChecked: stats.articlesChecked,
        articlesAdded: stats.articlesAdded,
        articlesUpdated: stats.articlesUpdated,
        keywordsGenerated: stats.keywordsGenerated,
        totalArticles: stats.totalArticles,
        errors: stats.errors.length
      });

    } catch (error) {
      console.error('❌ Fatal error in daily sync:', error);
      stats.errors.push(`Fatal sync error: ${error.message}`);
    }

    return stats;
  }

  private async fetchAllAteraArticles(): Promise<AteraArticle[]> {
    const allArticles: AteraArticle[] = [];
    let currentPage = 1;
    const itemsPerPage = 50;

    while (true) {
      try {
        const response = await fetch(
          `${this.baseUrl}?itemsInPage=${itemsPerPage}&page=${currentPage}`,
          {
            headers: {
              'X-API-KEY': process.env.ATERA_API_TOKEN!,
              'Accept': 'application/json'
            }
          }
        );

        if (!response.ok) {
          throw new Error(`Atera API error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.items || data.items.length === 0) {
          break; // No more pages
        }

        const pageArticles = this.parseAteraResponse(data.items);
        allArticles.push(...pageArticles);

        console.log(`📄 Fetched page ${currentPage}: ${pageArticles.length} articles`);
        currentPage++;

        // Safety check to prevent infinite loops
        if (currentPage > 20) {
          console.warn('⚠️ Reached maximum page limit (20), stopping fetch');
          break;
        }

      } catch (error) {
        console.error(`❌ Error fetching page ${currentPage}:`, error);
        break;
      }
    }

    return allArticles;
  }

  private parseAteraResponse(items: any[]): AteraArticle[] {
    return items.map(item => ({
      id: item.KBID?.toString() || '',
      title: item.KBProduct || 'Knowledge Base Article',
      content: item.KBContext || '',
      category: item.KBCategory || '',
      tags: this.processTags(item.KBKeywords),
      lastUpdated: item.KBLastUpdate ? new Date(item.KBLastUpdate) : undefined,
      kbproduct: item.KBProduct || '',
      kbIsPrivate: item.KBIsPrivate === true,
      kbStatus: parseInt(item.KBStatus) || 0,
      url: `https://helpdesk.anthemproperties.com/knowledgebase/article/${item.KBID}`
    })).filter(article => article.id && article.title !== 'Knowledge Base Article' && article.content);
  }

  private processTags(tags: any): string[] {
    if (!tags) return [];
    if (typeof tags === 'string') {
      return tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    }
    if (Array.isArray(tags)) {
      return tags.map(tag => String(tag).trim()).filter(tag => tag.length > 0);
    }
    return [];
  }

  private filterQualityArticles(articles: AteraArticle[]): AteraArticle[] {
    return articles.filter(article => {
      // Only include public articles that are published
      const isPublic = !article.kbIsPrivate;
      const isPublished = article.kbStatus === 2;
      const hasContent = article.content && article.content.trim().length > 0;
      
      return isPublic && isPublished && hasContent;
    });
  }

  private async updateExistingArticle(ateraArticle: AteraArticle): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(knowledgeBaseArticles)
      .where(eq(knowledgeBaseArticles.articleId, ateraArticle.id));

    if (!existing) return false;

    // Check if update is needed
    const needsUpdate = 
      existing.title !== ateraArticle.title ||
      existing.content !== ateraArticle.content ||
      JSON.stringify(existing.tags) !== JSON.stringify(ateraArticle.tags);

    if (needsUpdate) {
      await db
        .update(knowledgeBaseArticles)
        .set({
          title: ateraArticle.title,
          content: ateraArticle.content,
          tags: ateraArticle.tags,
          lastUpdated: ateraArticle.lastUpdated,
          url: ateraArticle.url,
          kbIsPrivate: ateraArticle.kbIsPrivate,
          kbStatus: ateraArticle.kbStatus
          // Preserve existing searchKeywords - don't overwrite AI-generated keywords
        })
        .where(eq(knowledgeBaseArticles.articleId, ateraArticle.id));

      console.log(`📝 Updated article: ${ateraArticle.title}`);
      return true;
    }

    return false;
  }

  private async addNewArticle(ateraArticle: AteraArticle): Promise<void> {
    await db.insert(knowledgeBaseArticles).values({
      articleId: ateraArticle.id,
      title: ateraArticle.title,
      content: ateraArticle.content,
      url: ateraArticle.url,
      tags: ateraArticle.tags,
      lastUpdated: ateraArticle.lastUpdated,
      searchKeywords: [], // Will be populated by generateMissingKeywords
      isActive: true,
      kbIsPrivate: ateraArticle.kbIsPrivate,
      kbStatus: ateraArticle.kbStatus
    });

    console.log(`➕ Added new article: ${ateraArticle.title}`);
  }

  private async generateMissingKeywords(): Promise<number> {
    // Find articles without search keywords
    const articlesNeedingKeywords = await db
      .select()
      .from(knowledgeBaseArticles)
      .where(
        or(
          isNull(knowledgeBaseArticles.searchKeywords),
          eq(knowledgeBaseArticles.searchKeywords, [])
        )
      );

    if (articlesNeedingKeywords.length === 0) {
      console.log('🎯 All articles already have search keywords');
      return 0;
    }

    console.log(`🧠 Generating keywords for ${articlesNeedingKeywords.length} articles...`);
    let generated = 0;

    for (const article of articlesNeedingKeywords) {
      try {
        const keywords = await this.generateSearchKeywords(article.title, article.content);
        
        await db
          .update(knowledgeBaseArticles)
          .set({ searchKeywords: keywords })
          .where(eq(knowledgeBaseArticles.id, article.id));

        console.log(`🔑 Generated keywords for: ${article.title}`);
        generated++;

        // Rate limiting - wait 100ms between API calls
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Failed to generate keywords for article ${article.id}:`, error);
      }
    }

    return generated;
  }

  private async generateSearchKeywords(title: string, content: string): Promise<string[]> {
    try {
      // Clean HTML content for better keyword extraction
      const cleanContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Use more content for better context, prioritize title and first 2000 chars
      const textToAnalyze = `Title: ${title}\n\nContent: ${cleanContent.substring(0, 2000)}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: `You are an expert at extracting specific, actionable search keywords from IT support documentation. 

REQUIREMENTS:
- Extract 5-7 highly specific keywords that users would search for
- Focus on: software names, specific problems, technical processes, company names, system names
- Avoid generic words like: "support", "help", "guide", "instructions", "troubleshooting", "setup", "configuration"
- Include specific technical terms, product names, and action-oriented phrases
- Use phrases when they're more specific than single words (e.g., "password reset" vs just "password")
- Ensure keywords are directly related to the actual content, not generic IT terms

Return a JSON object with a "keywords" array containing only the most relevant, specific search terms.`
          },
          {
            role: "user",
            content: `Extract specific search keywords from this IT support article. Focus on what users would actually search for to find this specific information:\n\n${textToAnalyze}`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 300
      });

      const result = JSON.parse(response.choices[0].message.content || '{"keywords": []}');
      const keywords = result.keywords || result.searchKeywords || [];
      
      // Filter and clean keywords
      const cleanedKeywords = Array.isArray(keywords) 
        ? keywords
            .map(k => String(k).trim().toLowerCase())
            .filter(k => k.length > 2 && k.length < 50)
            .filter(k => !this.isGenericKeyword(k))
            .slice(0, 7)
        : [];
      
      return cleanedKeywords.length > 0 ? cleanedKeywords : this.extractBasicKeywords(title);

    } catch (error) {
      console.error('❌ Error generating search keywords:', error);
      // Fallback: extract basic keywords from title
      return this.extractBasicKeywords(title);
    }
  }

  private isGenericKeyword(keyword: string): boolean {
    const genericTerms = [
      'it support', 'troubleshooting', 'help', 'guide', 'instructions', 
      'setup', 'configuration', 'support', 'documentation', 'manual',
      'tutorial', 'how to', 'steps', 'process', 'procedure', 'guide',
      'overview', 'introduction', 'basics', 'getting started'
    ];
    
    return genericTerms.some(term => 
      keyword.includes(term) || term.includes(keyword)
    );
  }

  private extractBasicKeywords(title: string): string[] {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 4);
  }

  private async cleanupRemovedArticles(currentArticleIds: string[]): Promise<void> {
    const existingArticles = await db.select().from(knowledgeBaseArticles);
    const articlesToRemove = existingArticles.filter(
      existing => !currentArticleIds.includes(existing.articleId)
    );

    if (articlesToRemove.length > 0) {
      console.log(`🗑️ Removing ${articlesToRemove.length} articles no longer in Atera`);
      
      for (const article of articlesToRemove) {
        await db
          .delete(knowledgeBaseArticles)
          .where(eq(knowledgeBaseArticles.articleId, article.articleId));
      }
    }
  }

  async getSyncStats(): Promise<SyncStats> {
    const totalArticles = await db.select().from(knowledgeBaseArticles);
    
    return {
      lastSyncTime: new Date(),
      articlesChecked: 0,
      articlesUpdated: 0,
      articlesAdded: 0,
      keywordsGenerated: 0,
      totalArticles: totalArticles.length,
      errors: []
    };
  }

  async triggerManualSync(): Promise<SyncStats> {
    console.log('🔧 Manual sync triggered');
    return this.performDailySync();
  }
}

export const dailyKnowledgeBaseSync = new DailyKnowledgeBaseSync();
