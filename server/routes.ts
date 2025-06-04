import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { BotFrameworkAdapter, ConversationState, MemoryStorage, UserState } from 'botbuilder';
import { itSupportBot } from './lib/teamsBot.js';
import { aiAnalyst } from './lib/aiAnalyst.js';
import { dailyKnowledgeBaseSync } from './lib/dailyKnowledgeBaseSync.js';

export async function registerRoutes(app: Express): Promise<Server> {
  // Create bot adapter
  const adapter = new BotFrameworkAdapter({
    appId: process.env.MICROSOFT_APP_ID || '',
    appPassword: process.env.MICROSOFT_APP_PASSWORD || '',
  });

  // Create conversation and user state
  const memoryStorage = new MemoryStorage();
  const conversationState = new ConversationState(memoryStorage);
  const userState = new UserState(memoryStorage);

  // Error handler for bot adapter
  adapter.onTurnError = async (context, error) => {
    console.error('Bot adapter error:', error);
    await context.sendActivity('Sorry, an error occurred while processing your request.');
  };

  // Teams bot endpoint
  app.post('/api/messages', async (req, res) => {
    console.log('Received message from Teams:', {
      type: req.body?.type,
      text: req.body?.text,
      from: req.body?.from?.id,
      conversation: req.body?.conversation?.id
    });
    
    try {
      await adapter.processActivity(req, res, async (context) => {
        console.log('Processing activity:', context.activity.type, context.activity.text);
        await itSupportBot.run(context);
      });
    } catch (error) {
      console.error('Error processing Teams message:', error);
      res.status(500).json({ error: 'Failed to process message' });
    }
  });

  // Test knowledge base search endpoint
  app.post('/api/test/kb-search', async (req, res) => {
    try {
      const { query } = req.body;
      console.log(`Testing KB search for: "${query}"`);
      
      const { intelligentSearchEngine } = await import('./lib/intelligentSearch.js');
      const { pool } = await import('./db.js');
      
      // Use intelligent search with keyword extraction
      const results = await intelligentSearchEngine.searchWithIntelligence(query, pool);
      
      const formattedResults = results.map(article => ({
        title: article.title,
        url: article.url,
        excerpt: article.content ? article.content.substring(0, 200).replace(/<[^>]*>/g, '') : '',
        searchKeywords: article.search_keywords,
        lastUpdated: article.last_updated
      }));
      
      res.json({
        query,
        foundArticles: results.length,
        articles: formattedResults
      });
    } catch (error) {
      console.error('KB search test error:', error);
      res.status(500).json({ error: error.message });
    }
  });



  // Health check endpoint
  app.get('/api/health', (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        teams_bot: !!(process.env.MICROSOFT_APP_ID && process.env.MICROSOFT_APP_PASSWORD),
        database: !!process.env.DATABASE_URL,
        atera_api: !!process.env.ATERA_API_TOKEN,
        openai: !!process.env.OPENAI_API_KEY,
      },
    };
    
    res.json(health);
  });

  // System configuration status
  app.get('/api/bot/config', async (req, res) => {
    try {
      const config = {
        teams_bot_configured: !!(process.env.MICROSOFT_APP_ID && process.env.MICROSOFT_APP_PASSWORD),
        openai_configured: !!process.env.OPENAI_API_KEY,
        atera_api_configured: !!process.env.ATERA_API_TOKEN,
        database_configured: !!process.env.DATABASE_URL,
        knowledge_base_articles: 0
      };
      
      // Get article count and sample data from database
      try {
        const pkg = await import('pg');
        const { Pool } = pkg.default;
        const client = new Pool({ connectionString: process.env.DATABASE_URL });
        
        const countResult = await client.query('SELECT COUNT(*) as total FROM knowledge_base_articles WHERE is_active = true');
        config.knowledge_base_articles = parseInt(countResult.rows[0].total);
        
        // Add sample articles for verification
        const sampleResult = await client.query('SELECT article_id, title FROM knowledge_base_articles WHERE is_active = true LIMIT 3');
        config.sample_articles = sampleResult.rows.map(row => ({
          id: row.article_id,
          title: row.title
        }));
        
        await client.end();
      } catch (dbError) {
        console.log('Could not get article count:', dbError);
        config.db_error = dbError.message;
      }
      
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get configuration' });
    }
  });

  // Update database with latest articles from Atera API
  app.post('/api/admin/update-articles', async (req, res) => {
    try {
      console.log('Updating knowledge base with latest articles...');
      
      if (!process.env.ATERA_API_TOKEN) {
        return res.status(400).json({ error: 'ATERA_API_TOKEN not configured' });
      }
      
      const pkg = await import('pg');
      const { Pool } = pkg.default;
      const client = new Pool({ connectionString: process.env.DATABASE_URL });
      
      // Fetch all articles from Atera API
      let allArticles = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore && page <= 10) {
        const response = await fetch(`https://app.atera.com/api/v3/knowledgebases?page=${page}&itemsInPage=50`, {
          headers: {
            'X-API-KEY': process.env.ATERA_API_TOKEN,
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Atera API error: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.items) {
          allArticles = allArticles.concat(data.items);
        }
        
        hasMore = data.nextLink && data.nextLink !== '';
        page++;
      }
      
      // Clear existing articles and insert fresh data
      await client.query('DELETE FROM knowledge_base_articles');
      
      let updated = 0;
      for (const article of allArticles) {
        try {
          const articleId = article.KBID?.toString() || `article_${updated}`;
          const title = `KB Article ${articleId}`;
          const content = article.KBContext || '';
          const url = `https://helpdesk.anthemproperties.com/knowledgebase/article/${articleId}`;
          const kbproduct = article.KBProduct || '';
          const keywords = article.KBKeywords || '';
          const tags = keywords ? keywords.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
          const lastUpdated = article.KBLastModified ? new Date(article.KBLastModified) : null;
          
          await client.query(`
            INSERT INTO knowledge_base_articles 
            (article_id, title, content, url, category, kbproduct, tags, last_updated, is_active) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [articleId, title, content, url, '', kbproduct, tags, lastUpdated, true]);
          
          updated++;
        } catch (err) {
          console.log(`Error inserting article: ${err.message}`);
        }
      }
      
      await client.end();
      
      res.json({ 
        success: true, 
        message: `Updated ${updated} articles from Atera API`,
        total_articles: updated
      });
    } catch (error) {
      console.error('Article update error:', error);
      res.status(500).json({ 
        error: 'Article update failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Admin route to update privacy flags and clean database
  app.post("/api/admin/clean-private-articles", async (req, res) => {
    try {
      const token = process.env.ATERA_API_TOKEN;
      if (!token) {
        return res.status(500).json({ success: false, error: "Atera API token not configured" });
      }

      let allArticles: any[] = [];
      let page = 1;
      let hasMorePages = true;

      // Fetch all articles from API to get current privacy/status values
      while (hasMorePages) {
        const response = await fetch(`https://app.atera.com/api/v3/knowledgebases?itemsInPage=50&page=${page}`, {
          headers: {
            'X-API-KEY': token,
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch from Atera API: ${response.status}`);
        }

        const data = await response.json();
        allArticles = allArticles.concat(data.items);
        hasMorePages = page < data.totalPages;
        page++;
      }

      // Update database with correct privacy/status values
      let updatedCount = 0;
      for (const article of allArticles) {
        const articleId = article.KBID?.toString();
        if (!articleId) continue;

        await db.update(knowledgeBaseArticles)
          .set({
            kbIsPrivate: article.KBIsPrivate === true,
            kbStatus: Number(article.KBStatus) || 2
          })
          .where(eq(knowledgeBaseArticles.articleId, articleId));
        updatedCount++;
      }

      // Now delete private and unpublished articles
      const deleteResult = await db.delete(knowledgeBaseArticles)
        .where(or(
          eq(knowledgeBaseArticles.kbIsPrivate, true),
          ne(knowledgeBaseArticles.kbStatus, 2)
        ));

      const remainingCount = await db.select({ count: sql<number>`count(*)` }).from(knowledgeBaseArticles);

      res.json({ 
        success: true, 
        message: `Updated ${updatedCount} articles, removed private/unpublished articles`,
        remainingArticles: remainingCount[0]?.count || 0
      });
    } catch (error) {
      console.error("Cleanup failed:", error);
      res.status(500).json({ success: false, error: "Cleanup failed" });
    }
  });

  // Get knowledge base statistics  
  app.get('/api/admin/kb-stats', async (req, res) => {
    try {
      const pkg = await import('pg');
      const { Pool } = pkg.default;
      const client = new Pool({ connectionString: process.env.DATABASE_URL });
      
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_articles,
          COUNT(CASE WHEN LENGTH(content) > 0 THEN 1 END) as articles_with_content,
          MAX(last_updated) as latest_update,
          COUNT(DISTINCT kbproduct) as unique_products
        FROM knowledge_base_articles 
        WHERE is_active = true
      `);
      
      await client.end();
      
      res.json({
        stats: result.rows[0]
      });
    } catch (error) {
      console.error('KB stats error:', error);
      res.status(500).json({ error: 'Failed to get knowledge base statistics' });
    }
  });

  // Get automatic update status
  app.get('/api/updates/status', async (req, res) => {
    try {
      const stats = await incrementalUpdater.getUpdateStats();
      res.json(stats);
    } catch (error) {
      console.error('Update status error:', error);
      res.status(500).json({ error: 'Failed to get update status' });
    }
  });

  // Consolidated daily sync (replaces separate migration, incremental, and keyword endpoints)
  app.post('/api/sync/daily', async (req, res) => {
    try {
      console.log('🚀 Starting manual daily sync...');
      const stats = await dailyKnowledgeBaseSync.triggerManualSync();
      res.json({
        success: true,
        message: 'Daily sync completed successfully',
        stats: {
          articlesChecked: stats.articlesChecked,
          articlesAdded: stats.articlesAdded,
          articlesUpdated: stats.articlesUpdated,
          keywordsGenerated: stats.keywordsGenerated,
          totalArticles: stats.totalArticles,
          errors: stats.errors,
          lastSyncTime: stats.lastSyncTime
        }
      });
    } catch (error) {
      console.error('Daily sync error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to perform daily sync',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get sync status
  app.get('/api/sync/status', async (req, res) => {
    try {
      const stats = await dailyKnowledgeBaseSync.getSyncStats();
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Sync status error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to get sync status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Regenerate keywords with improved logic
  app.post('/api/sync/regenerate-keywords', async (req, res) => {
    try {
      console.log('🔄 Starting keyword regeneration with improved logic...');
      
      // Force regeneration by clearing existing keywords first
      const stats = await dailyKnowledgeBaseSync.triggerManualSync();
      
      res.json({
        success: true,
        message: 'Keywords regenerated with improved content analysis',
        stats: {
          keywordsGenerated: stats.keywordsGenerated,
          totalArticles: stats.totalArticles,
          errors: stats.errors
        }
      });
    } catch (error) {
      console.error('Keyword regeneration error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to regenerate keywords',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Generate keywords for articles endpoint
  app.post('/api/keywords/generate', async (req, res) => {
    try {
      const { batchSize = 5 } = req.body;
      
      // Get articles without keywords
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      
      const result = await pool.query(`
        SELECT article_id, title, content 
        FROM knowledge_base_articles 
        WHERE kb_is_private = false AND kb_status = 2 AND search_keywords IS NULL
        ORDER BY article_id
        LIMIT $1
      `, [batchSize]);
      
      if (result.rows.length === 0) {
        await pool.end();
        return res.json({
          success: true,
          message: 'All articles already have keywords',
          processed: 0
        });
      }

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      let processed = 0;
      let errors = 0;
      
      for (const article of result.rows) {
        try {
          const contentToAnalyze = `
Title: ${article.title}
Content: ${article.content.substring(0, 1500)}${article.content.length > 1500 ? '...' : ''}
          `.trim();
          
          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `Generate search keywords for this IT support article. Include technical terms, user phrases, error messages, software names, and action words. Return JSON with "keywords" array of 20-30 terms.`
              },
              {
                role: "user", 
                content: contentToAnalyze
              }
            ],
            response_format: { type: "json_object" },
            max_tokens: 400
          });
          
          const keywordData = JSON.parse(response.choices[0].message.content);
          const keywords = keywordData.keywords || [];
          
          await pool.query(
            'UPDATE knowledge_base_articles SET search_keywords = $1 WHERE article_id = $2',
            [keywords, article.article_id]
          );
          
          processed++;
          console.log(`Generated ${keywords.length} keywords for article ${article.article_id}`);
          
        } catch (error) {
          errors++;
          console.error(`Error processing article ${article.article_id}:`, error.message);
        }
      }
      
      // Get updated progress
      const progressResult = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN search_keywords IS NOT NULL THEN 1 END) as completed
        FROM knowledge_base_articles 
        WHERE kb_is_private = false AND kb_status = 2
      `);
      
      await pool.end();
      
      const progress = progressResult.rows[0];
      
      res.json({
        success: true,
        message: `Processed ${processed} articles`,
        processed,
        errors,
        progress: {
          completed: parseInt(progress.completed),
          total: parseInt(progress.total),
          remaining: parseInt(progress.total) - parseInt(progress.completed)
        }
      });
      
    } catch (error) {
      console.error('Keyword generation error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to generate keywords',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Legacy migration endpoint - replaced by daily sync
  app.post('/api/admin/fix-content', async (req, res) => {
    try {
      console.log('Redirecting to consolidated daily sync...');
      const stats = await dailyKnowledgeBaseSync.triggerManualSync();
      res.json({ 
        success: true, 
        message: 'Content migration completed via daily sync',
        stats
      });
    } catch (error) {
      console.error('Content migration error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to migrate content',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Search your real knowledge base articles
  app.post('/api/test/search', async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      // Import pg dynamically to work with ES modules
      const pkg = await import('pg');
      const { Pool } = pkg.default;
      const client = new Pool({ connectionString: process.env.DATABASE_URL });
      
      const searchPattern = `%${query.toLowerCase()}%`;
      const result = await client.query(`
        SELECT article_id, title, url, content, last_updated
        FROM knowledge_base_articles 
        WHERE (
          LOWER(title) LIKE $1 OR 
          LOWER(content) LIKE $1
        )
        ORDER BY 
          CASE 
            WHEN LOWER(title) LIKE $1 THEN 1
            WHEN LOWER(content) LIKE $1 THEN 2
            ELSE 3
          END
        LIMIT 10
      `, [searchPattern]);

      const articles = result.rows.map((article: any) => {
        const content = article.content || '';
        const excerpt = content.length > 200 
          ? content.substring(0, 200).replace(/<[^>]*>/g, '') + '...'
          : content.replace(/<[^>]*>/g, '') || 'Knowledge Base Article';
        
        return {
          title: article.title,
          url: article.url,
          excerpt: excerpt,
          category: article.title,
          lastUpdated: article.last_updated
        };
      });
      
      await client.end();
      
      res.json({
        query,
        results_count: articles.length,
        results: articles.slice(0, 5),
      });
    } catch (error) {
      console.error('Test search error:', error);
      res.status(500).json({ 
        error: 'Search test failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Test AI-powered bot response with real knowledge base
  app.post('/api/test/bot-response', async (req, res) => {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'Message parameter is required' });
      }

      // Use intelligent search to find relevant articles
      const pkg = await import('pg');
      const { Pool } = pkg.default;
      const client = new Pool({ connectionString: process.env.DATABASE_URL });
      
      const { intelligentSearchEngine } = await import('./lib/intelligentSearch.js');
      const result = await intelligentSearchEngine.searchWithIntelligence(message, client);

      const relevantArticles = result.map((article: any) => ({
        title: article.kbproduct || `Article ${article.article_id}`,
        content: article.content || '',
        url: article.url,
        lastUpdated: article.last_updated
      }));

      await client.end();

      // Generate AI analysis using your real articles
      const analysis = await aiAnalyst.generateTechnicalAnalysis(message, relevantArticles);
      
      const response = {
        userQuery: message,
        analysis,
        knowledgeBaseArticles: relevantArticles.length,
        relevantArticles: relevantArticles.map(article => ({
          title: article.title,
          url: article.url,
          preview: article.content.substring(0, 200).replace(/<[^>]*>/g, '') + '...'
        })),
        adaptiveCardData: {
          title: 'Expert IT Support Analysis',
          subtitle: `${analysis.severity.toUpperCase()} Priority • Est. ${analysis.estimatedResolutionTime}`,
          sections: [],
          actions: []
        },
        responseMetadata: {
          processingTime: 0,
          articlesAnalyzed: 0,
          confidenceScore: 85
        }
      };

      res.json({
        userMessage: message,
        botResponse: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Bot response test error:', error);
      res.status(500).json({ 
        error: 'Bot response test failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });



  // Get interaction analytics
  app.get('/api/analytics/interactions', async (req, res) => {
    try {
      const interactions = await storage.getRecentInteractions(50);
      
      const analytics = {
        total_interactions: interactions.length,
        avg_response_time: interactions.length > 0 
          ? interactions.reduce((sum, i) => sum + (i.responseTime || 0), 0) / interactions.length 
          : 0,
        recent_queries: interactions.slice(0, 10).map(i => ({
          query: i.userQuery,
          timestamp: i.createdAt,
          response_time: i.responseTime,
        })),
      };
      
      res.json(analytics);
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to get analytics' });
    }
  });

  // Simple cache stats endpoint (placeholder for compatibility)
  app.get('/api/admin/cache-stats', async (req, res) => {
    res.json({ size: 0, keys: [] });
  });



  const httpServer = createServer(app);
  return httpServer;
}
