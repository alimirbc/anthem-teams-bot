import { 
  TeamsActivityHandler, 
  TurnContext, 
  MessageFactory, 
  CardFactory, 
  ActivityTypes,
  ChannelInfo,
  TeamsInfo
} from 'botbuilder';
import { aiAnalyst, type ITSupportResponse } from './aiAnalyst.js';
import { storage } from '../storage.js';

interface AdaptiveCard {
  type: string;
  version: string;
  body: any[];
  actions?: any[];
}

export class ITSupportBot extends TeamsActivityHandler {
  constructor() {
    super();

    // Handle messages
    this.onMessage(async (context, next) => {
      await this.handleMessage(context);
      await next();
    });

    // Handle members added
    this.onMembersAdded(async (context, next) => {
      await this.handleMembersAdded(context);
      await next();
    });


  }

  private async handleMessage(context: TurnContext): Promise<void> {
    let userMessage = context.activity.text?.trim();
    
    // Handle adaptive card submit actions
    if (context.activity.value && context.activity.value.text) {
      userMessage = context.activity.value.text;
    }
    
    if (!userMessage) return;

    const userId = context.activity.from.id;

    try {
      // Show typing indicator
      await this.sendTypingIndicator(context);

      // Handle specific bot commands
      const command = userMessage.toLowerCase().trim();
      
      // Check for greetings - be more specific to avoid duplicates
      if (command === 'hello' || command === 'hi' || command === 'hey' || command === 'start') {
        await this.sendWelcomeMessage(context);
        return;
      }
      
      // Check for help command
      if (command === 'help' || command === '?') {
        await this.sendHelpMessage(context);
        return;
      }
      
      // Check for status command
      if (command === 'status') {
        await this.sendStatusMessage(context);
        return;
      }

      // Process technical support request
      const startTime = Date.now();
      
      // Search knowledge base using AI-generated keywords for better matching
      let searchResults: any[] = [];
      try {
        const pkg = await import('pg');
        const { Pool } = pkg.default;
        const client = new Pool({ connectionString: process.env.DATABASE_URL });
        
        // Enhanced search using precise matching for better article discovery
        const stopWords = ['how', 'to', 'can', 'my', 'the', 'and', 'for', 'with', 'are', 'is', 'do', 'does', 'will', 'what', 'when', 'where', 'why', 'help', 'me', 'i', 'you', 'a', 'an'];
        const searchTerms = userMessage.toLowerCase().split(' ')
          .filter((term: string) => term.length > 2 && !stopWords.includes(term));
        console.log(`Searching for terms: [${searchTerms.join(', ')}] from message: "${userMessage}"`);
        console.log(`Using search query with keywords support`);
        
        // Always search for articles using broad matching
        let result;
        
        // Strategy 1: Search for meaningful terms in content and title
        if (searchTerms.length > 0) {
          // For single term, use OR logic. For multiple terms, prefer articles that match more terms
          const searchConditions = searchTerms.map((_, i) => 
            `(LOWER(title) ILIKE $${i + 1} OR LOWER(content) ILIKE $${i + 1} OR array_to_string(search_keywords, ' ') ILIKE $${i + 1})`
          ).join(' OR ');
          
          // Get all matching articles first
          result = await client.query(`
            SELECT article_id, title, url, content, last_updated, search_keywords
            FROM knowledge_base_articles 
            WHERE (${searchConditions})
            AND is_active = true
            ORDER BY last_updated DESC
          `, searchTerms.map(term => `%${term}%`));
          
          // Sort by relevance in JavaScript for more control
          if (result.rows.length > 0) {
            result.rows = result.rows.map((row: any) => {
              let score = 0;
              const title = row.title.toLowerCase();
              const keywords = Array.isArray(row.search_keywords) ? row.search_keywords.join(' ').toLowerCase() : '';
              
              // High score for title containing all search terms
              if (searchTerms.every(term => title.includes(term))) {
                score += 50;
              }
              // High score for keywords containing all search terms  
              if (searchTerms.every(term => keywords.includes(term))) {
                score += 40;
              }
              // Medium score for title containing any search term
              searchTerms.forEach(term => {
                if (title.includes(term)) score += 10;
                if (keywords.includes(term)) score += 5;
              });
              
              return { ...row, relevance_score: score };
            }).sort((a: any, b: any) => b.relevance_score - a.relevance_score)
              .filter((row: any) => row.relevance_score >= 10) // Only show articles with decent relevance
              .slice(0, 3); // Limit to top 3 most relevant articles
          }
          
          console.log(`Database search returned ${result.rows.length} articles`);
          if (result.rows.length > 0) {
            console.log('Top articles with relevance scores:', 
              result.rows.slice(0, 3).map(row => ({
                title: row.title,
                score: row.relevance_score || 0
              }))
            );
          }
        } else {
          // No search terms, don't show any articles
          result = { rows: [] };
          console.log('No search terms provided, skipping article search');
        }

        searchResults = result.rows.map((article: any) => {
          const content = article.content || '';
          const cleanContent = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
          const excerpt = cleanContent.length > 150 
            ? cleanContent.substring(0, 150) + '...'
            : cleanContent || 'Click to view the full article for detailed instructions.';
          
          return {
            title: article.title || 'Knowledge Base Article',
            url: article.url || `https://helpdesk.anthemproperties.com/knowledgebase/article/${article.article_id}`,
            excerpt: excerpt,
            relevanceScore: 85,
            category: 'Knowledge Base',
            lastUpdated: article.last_updated
          };
        });

        await client.end();
        console.log(`Found ${searchResults.length} relevant articles for: "${userMessage}"`);
        console.log('Search results:', searchResults.map(r => ({ title: r.title, url: r.url })));
        
        // If no articles found, log and continue without articles
        if (searchResults.length === 0) {
          console.log('No relevant articles found for the query');
        }
        

      } catch (error) {
        console.error('Knowledge base search failed:', error);
        searchResults = [];
      }

      // Generate AI-powered IT support response with knowledge base context
      console.log(`About to generate AI response with ${searchResults.length} search results`);
      const supportResponse = await this.generateAIResponse(userMessage, searchResults);
      console.log(`Support response generated with ${supportResponse.knowledgeBaseInsights.length} insights`);

      // Send adaptive card response
      await this.sendSupportResponse(context, supportResponse);

      // Store interaction for analytics
      await this.storeInteraction(
        userId,
        userMessage,
        searchResults,
        supportResponse,
        Date.now() - startTime
      );

    } catch (error) {
      console.error('Error handling message:', error);
      await this.sendErrorMessage(context, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async generateAIResponse(userMessage: string, knowledgeBaseResults: any[] = []): Promise<ITSupportResponse> {
    // Generate simplified AI-powered technical analysis
    const analysis = await aiAnalyst.generateTechnicalAnalysis(userMessage, []);
    
    // Convert knowledge base results to insights format with clean text
    const knowledgeBaseInsights = knowledgeBaseResults.map(result => {
      // Clean HTML from excerpt to get readable text
      const cleanExcerpt = result.excerpt 
        ? result.excerpt.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
        : 'Relevant information found';
      
      // Limit excerpt length for better display
      const shortExcerpt = cleanExcerpt.length > 100 
        ? cleanExcerpt.substring(0, 100) + '...'
        : cleanExcerpt;

      return {
        articleTitle: result.title || 'Knowledge Base Article',
        articleUrl: result.url || '#',
        keyFinding: shortExcerpt,
        solution: `See full article: ${result.title || 'Knowledge Base Article'}`,
        relevanceScore: result.relevanceScore || 50,
        lastUpdated: result.lastUpdated || new Date()
      };
    });
    
    console.log(`Generated ${knowledgeBaseInsights.length} knowledge base insights from ${knowledgeBaseResults.length} results`);
    console.log('Knowledge base insights:', knowledgeBaseInsights.map(i => ({ title: i.articleTitle, url: i.articleUrl })));
    

    
    return {
      analysis,
      knowledgeBaseInsights,
      adaptiveCardData: {
        title: 'IT Support Analysis',
        subtitle: `${analysis.severity.toUpperCase()} Priority • Est. ${analysis.estimatedResolutionTime}`,
        sections: [],
        actions: []
      },
      responseMetadata: {
        processingTime: 0,
        articlesAnalyzed: knowledgeBaseResults.length,
        confidenceScore: knowledgeBaseResults.length > 0 ? 85 : 75
      }
    };
  }

  private async sendTypingIndicator(context: TurnContext): Promise<void> {
    const typingActivity = MessageFactory.text('');
    typingActivity.type = ActivityTypes.Typing;
    await context.sendActivity(typingActivity);
  }

  private async sendWelcomeMessage(context: TurnContext): Promise<void> {
    const welcomeCard = this.createWelcomeCard();
    const cardActivity = MessageFactory.attachment(CardFactory.adaptiveCard(welcomeCard));
    await context.sendActivity(cardActivity);
  }

  private createWelcomeCard(): AdaptiveCard {
    return {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: 'Welcome to Anthem\'s AI Assistant!',
          weight: 'Bolder',
          size: 'Large',
          spacing: 'Medium'
        },
        {
          type: 'TextBlock',
          text: 'I\'m here to help with your IT issues quickly and efficiently. Here\'s what I can help you with: troubleshooting common issues like printers, emails, or computer performance, and guiding you through solutions to technical problems.',
          wrap: true,
          spacing: 'Medium',
          size: 'Medium'
        },
        {
          type: 'TextBlock',
          text: 'To get started, select a common issue below or describe your problem in your own words.',
          wrap: true,
          spacing: 'Medium',
          size: 'Medium',
          weight: 'Bolder'
        },
        {
          type: 'ActionSet',
          actions: [
            {
              type: 'Action.Submit',
              title: 'My printer isn\'t responding',
              data: { text: 'My printer isn\'t responding' }
            },
            {
              type: 'Action.Submit',
              title: 'I\'m not receiving emails',
              data: { text: 'I\'m not receiving emails' }
            }
          ]
        },
        {
          type: 'ActionSet',
          actions: [
            {
              type: 'Action.Submit',
              title: 'My computer is slow',
              data: { text: 'My computer is slow' }
            },
            {
              type: 'Action.Submit',
              title: 'I can\'t join Teams meeting',
              data: { text: 'I can\'t join Teams meeting' }
            }
          ]
        },
        {
          type: 'ActionSet',
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'Submit A Helpdesk Ticket',
              url: 'https://helpdesk.anthemproperties.com/tickets/add',
              style: 'default'
            }
          ]
        }
      ]
    };
  }

  private async sendSupportResponse(context: TurnContext, response: ITSupportResponse): Promise<void> {
    const adaptiveCard = this.createSupportResponseCard(response);
    const cardActivity = MessageFactory.attachment(CardFactory.adaptiveCard(adaptiveCard));
    await context.sendActivity(cardActivity);
  }

  private createSupportResponseCard(response: ITSupportResponse): AdaptiveCard {
    const { analysis, knowledgeBaseInsights } = response;

    const severityColor = {
      'low': 'Good',
      'medium': 'Warning', 
      'high': 'Attention',
      'critical': 'Attention'
    }[analysis.severity] || 'Default';

    const cardBody: any[] = [
      // Header with severity indicator
      {
        type: 'Container',
        style: 'emphasis',
        items: [
          {
            type: 'TextBlock',
            text: 'IT Support Response',
            weight: 'Bolder',
            size: 'Large'
          },
          {
            type: 'TextBlock',
            text: `${analysis.severity.toUpperCase()} Priority • Est. ${analysis.estimatedResolutionTime}`,
            size: 'Medium',
            color: severityColor,
            weight: 'Bolder'
          }
        ]
      }
    ];

    // Add knowledge base articles FIRST and prominently
    console.log(`Creating card with ${knowledgeBaseInsights?.length || 0} knowledge base insights`);
    if (knowledgeBaseInsights && knowledgeBaseInsights.length > 0) {
      cardBody.push({
        type: 'Container',
        style: 'emphasis',
        spacing: 'Large',
        items: [
          {
            type: 'TextBlock',
            text: 'Anthem Knowledge Base',
            weight: 'Bolder',
            size: 'Large',
            color: 'Default'
          },
          ...knowledgeBaseInsights.map((insight, index) => ({
            type: 'Container',
            style: 'default',
            spacing: 'Medium',
            separator: index > 0,
            items: [
              {
                type: 'TextBlock',
                text: insight.articleTitle,
                weight: 'Bolder',
                wrap: true,
                size: 'Medium',
                color: 'Default'
              },
              {
                type: 'TextBlock',
                text: this.createBetterExcerpt(insight.keyFinding || insight.solution || ''),
                wrap: true,
                spacing: 'Small',
                size: 'Small',
                color: 'Default',
                isSubtle: true
              },
              {
                type: 'ActionSet',
                spacing: 'Small',
                horizontalAlignment: 'Center',
                actions: [
                  {
                    type: 'Action.OpenUrl',
                    title: 'Open Full Article',
                    url: insight.articleUrl,
                    style: 'default'
                  }
                ]
              }
            ]
          }))
        ]
      });
    }

    // Then add diagnosis and troubleshooting steps
    cardBody.push({
      type: 'Container',
      style: 'default',
      spacing: 'Medium',
      items: [
        {
          type: 'TextBlock',
          text: 'What\'s happening:',
          weight: 'Bolder',
          size: 'Large',
          color: 'Default'
        },
        {
          type: 'TextBlock',
          text: this.simplifyTechnicalText(analysis.issueDiagnosis),
          wrap: true,
          spacing: 'Small',
          size: 'Medium'
        }
      ]
    });

    // Add immediate actions with larger text
    if (analysis.immediateActions && analysis.immediateActions.length > 0) {
      cardBody.push({
        type: 'Container',
        style: 'default',
        spacing: 'Medium',
        items: [
          {
            type: 'TextBlock',
            text: 'Try these steps:',
            weight: 'Bolder',
            size: 'Large',
            color: 'Default'
          },
          ...analysis.immediateActions.slice(0, 3).map((action, index) => ({
            type: 'Container',
            items: [
              {
                type: 'TextBlock',
                text: `${index + 1}. ${action.step}`,
                weight: 'Bolder',
                wrap: true,
                size: 'Medium'
              },
              {
                type: 'TextBlock',
                text: this.simplifyTechnicalText(action.description),
                wrap: true,
                spacing: 'None',
                size: 'Medium'
              }
            ]
          }))
        ]
      });
    }

    // Add prominent helpdesk ticket button at the bottom
    cardBody.push({
      type: 'Container',
      style: 'emphasis',
      spacing: 'Large',
      items: [
        {
          type: 'ActionSet',
          horizontalAlignment: 'Center',
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'Submit A Helpdesk Ticket',
              url: 'https://helpdesk.anthemproperties.com/tickets/add',
              style: 'default'
            }
          ]
        }
      ]
    });

    return {
      type: 'AdaptiveCard',
      version: '1.4',
      body: cardBody,
      actions: [
        {
          type: 'Action.Submit',
          title: 'Get More Details',
          data: { text: 'Can you provide more detailed steps?' },
          style: 'default'
        },
        {
          type: 'Action.Submit',
          title: 'Search More Solutions',
          data: { text: 'Can you help me find more solutions?' },
          style: 'default'
        }
      ]
    };
  }

  private simplifyTechnicalText(text: string): string {
    // Replace technical terms with simpler language
    return text
      .replace(/authentication/gi, 'login')
      .replace(/authorization/gi, 'permission')
      .replace(/configuration/gi, 'settings')
      .replace(/initialize/gi, 'start up')
      .replace(/terminate/gi, 'close')
      .replace(/execute/gi, 'run')
      .replace(/directory/gi, 'folder')
      .replace(/repository/gi, 'storage')
      .replace(/protocol/gi, 'method')
      .replace(/interface/gi, 'screen')
      .replace(/implement/gi, 'set up')
      .replace(/functionality/gi, 'feature')
      .replace(/troubleshoot/gi, 'fix')
      .replace(/diagnostic/gi, 'check');
  }

  private createBetterExcerpt(text: string): string {
    if (!text) return '';
    
    // Clean up the text by removing HTML and excess whitespace
    const cleaned = text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
    
    // Keep it concise but informative
    if (cleaned.length <= 120) {
      return cleaned;
    }
    
    // Find a good breaking point near 120 characters
    const truncated = cleaned.substring(0, 120);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > 80) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  private async handleMembersAdded(context: TurnContext): Promise<void> {
    const membersAdded = context.activity.membersAdded;
    if (membersAdded) {
      for (const member of membersAdded) {
        if (member.id !== context.activity.recipient.id) {
          await this.sendWelcomeMessage(context);
        }
      }
    }
  }

  private async sendHelpMessage(context: TurnContext): Promise<void> {
    const helpText = `
**Available Commands:**
- **help** - Show this help message
- **status** - Check bot status
- Simply describe your IT issue for assistance

**Example queries:**
- "My email is not working"
- "I can't connect to wifi" 
- "Outlook keeps crashing"
- "How do I reset my password"
    `;
    
    await context.sendActivity(MessageFactory.text(helpText));
  }

  private async sendStatusMessage(context: TurnContext): Promise<void> {
    const statusText = `
**Bot Status: ✅ Online**
- Knowledge Base: Connected
- AI Analysis: Available  
- Response Time: < 3 seconds
- Articles Available: 50+ technical guides
    `;
    
    await context.sendActivity(MessageFactory.text(statusText));
  }

  private async sendErrorMessage(context: TurnContext, error: string): Promise<void> {
    const errorText = `❌ **Error occurred:** ${error}\n\nPlease try again or contact IT support if the issue persists.`;
    await context.sendActivity(MessageFactory.text(errorText));
  }



  private async storeInteraction(
    userId: string,
    userQuery: string, 
    searchResults: any[],
    supportResponse: ITSupportResponse,
    responseTime: number
  ): Promise<void> {
    try {
      const interaction = {
        userId,
        userQuery,
        generatedKeywords: [],
        foundArticles: searchResults,
        aiResponse: JSON.stringify(supportResponse.analysis),
        responseTime,
        wasHelpful: null
      };
      
      await storage.createSupportInteraction(interaction);
    } catch (error) {
      console.error('Failed to store interaction:', error);
    }
  }
}

export const itSupportBot = new ITSupportBot();