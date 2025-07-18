import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Byam Client - Integrates with Bacardi's LLM system for fix generation
 * 
 * Design Patterns Used:
 * - Adapter Pattern: Adapts our Node.js system to work with Bacardi's Java/Python system
 * - Factory Pattern: Creates different LLM processors based on configuration
 * - Command Pattern: Encapsulates LLM requests as command objects
 * - Bridge Pattern: Bridges between our system and Bacardi's existing architecture
 */
export class ByamClient {
  constructor(context, config = {}) {
    this.context = context;
    this.log = context.log;
    this.config = {
      bacardiPath: config.bacardiPath || path.join(__dirname, '../../../bacardi-main'),
      pythonScript: config.pythonScript || 'llm/call_llm.py',
      maxRetries: 3,
      timeout: 120000, // 2 minutes
      ...config
    };

    // Initialize LLM processors
    this.llmProcessors = new Map([
      ['openai', new OpenAIProcessor(context, this.config)],
      ['anthropic', new AnthropicProcessor(context, this.config)],
      ['gemini', new GeminiProcessor(context, this.config)]
    ]);
  }

  /**
   * Generate fixes using Bacardi's LLM system
   * @param {Object} request - Fix generation request
   * @returns {Promise<Object>} - Generated fixes response
   */
  async generateFixes(request) {
    const requestId = `byam-${Date.now()}`;
    
    try {
      this.log.info(`🧠 Generating fixes with Byam [${requestId}]`);
      
      // Step 1: Prepare request for Bacardi system
      const bacardiRequest = await this.prepareBacardiRequest(request, requestId);
      
      // Step 2: Extract affected code and API diffs
      const codeAnalysis = await this.analyzeAffectedCode(request, requestId);
      
      // Step 3: Generate prompts using Bacardi's prompt system
      const prompts = await this.generatePrompts(bacardiRequest, codeAnalysis);
      
      // Step 4: Call LLM for fix generation
      const llmResponse = await this.callLLM(prompts, requestId);
      
      // Step 5: Parse and validate LLM response
      const fixes = await this.parseLLMResponse(llmResponse, request);
      
      // Step 6: Generate JSON payload with context
      const response = {
        success: true,
        requestId,
        fixes,
        metadata: {
          repository: request.repository,
          buildTool: request.buildTool,
          issuesAnalyzed: request.issues.length,
          promptsGenerated: prompts.length,
          llmModel: this.config.llmModel || 'gpt-4',
          processingTime: Date.now() - parseInt(requestId.split('-')[1])
        }
      };

      this.log.info(`✅ Generated ${fixes.length} fixes for ${request.repository}`);
      return response;

    } catch (error) {
      this.log.error(`❌ Fix generation failed [${requestId}]: ${error.message}`, error);
      return {
        success: false,
        requestId,
        error: error.message,
        fixes: []
      };
    }
  }

  /**
   * Prepare request for Bacardi system format
   * @param {Object} request - Original request
   * @param {string} requestId - Request ID
   * @returns {Promise<Object>} - Bacardi-formatted request
   */
  async prepareBacardiRequest(request, requestId) {
    const workingDir = path.join('/tmp', `byam-${requestId}`);
    await fs.mkdir(workingDir, { recursive: true });

    // Create log file
    const logFile = path.join(workingDir, 'build.log');
    await fs.writeFile(logFile, request.buildLogs, 'utf8');

    // Create dependency info file
    const depInfoFile = path.join(workingDir, 'dependency-info.json');
    await fs.writeFile(depInfoFile, JSON.stringify(request.dependencyInfo, null, 2), 'utf8');

    return {
      repository: request.repository,
      buildTool: request.buildTool,
      logFile,
      dependencyInfoFile: depInfoFile,
      workingDir,
      issues: request.issues
    };
  }

  /**
   * Analyze affected code using Bacardi's extractor
   * @param {Object} request - Original request
   * @param {string} requestId - Request ID
   * @returns {Promise<Object>} - Code analysis result
   */
  async analyzeAffectedCode(request, requestId) {
    try {
      this.log.info(`🔍 Analyzing affected code [${requestId}]`);

      // Use Bacardi's extractor to identify affected files
      const extractorResult = await this.runBacardiExtractor(request);
      
      // Identify API changes and breaking changes
      const apiDiffs = await this.extractApiDiffs(request);
      
      return {
        affectedFiles: extractorResult.affectedFiles || [],
        apiDiffs: apiDiffs || [],
        codeSnippets: extractorResult.codeSnippets || [],
        errorMessages: request.issues.map(issue => issue.message)
      };
    } catch (error) {
      this.log.warn(`⚠️ Code analysis failed, using fallback: ${error.message}`);
      return {
        affectedFiles: [],
        apiDiffs: [],
        codeSnippets: [],
        errorMessages: request.issues.map(issue => issue.message)
      };
    }
  }

  /**
   * Generate prompts using Bacardi's prompt system
   * @param {Object} bacardiRequest - Bacardi request
   * @param {Object} codeAnalysis - Code analysis result
   * @returns {Promise<Array>} - Generated prompts
   */
  async generatePrompts(bacardiRequest, codeAnalysis) {
    try {
      this.log.info(`📝 Generating prompts for fix generation`);

      const prompts = [];
      
      // Generate base prompt with build logs and errors
      const basePrompt = await this.generateBasePrompt(bacardiRequest, codeAnalysis);
      prompts.push(basePrompt);

      // Generate specific prompts for each issue
      for (const issue of bacardiRequest.issues) {
        const issuePrompt = await this.generateIssuePrompt(issue, codeAnalysis);
        prompts.push(issuePrompt);
      }

      return prompts;
    } catch (error) {
      this.log.error(`❌ Prompt generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Call LLM using Bacardi's Python script
   * @param {Array} prompts - Generated prompts
   * @param {string} requestId - Request ID
   * @returns {Promise<Object>} - LLM response
   */
  async callLLM(prompts, requestId) {
    try {
      this.log.info(`🤖 Calling LLM for fix generation [${requestId}]`);

      const responses = [];
      
      for (const prompt of prompts) {
        const response = await this.executeLLMCall(prompt, requestId);
        responses.push(response);
      }

      return {
        success: true,
        responses,
        totalPrompts: prompts.length
      };
    } catch (error) {
      this.log.error(`❌ LLM call failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute single LLM call using Bacardi's Python script
   * @param {Object} prompt - Prompt object
   * @param {string} requestId - Request ID
   * @returns {Promise<Object>} - LLM response
   */
  async executeLLMCall(prompt, requestId) {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(this.config.bacardiPath, this.config.pythonScript);
      const promptFile = path.join('/tmp', `prompt-${requestId}-${Date.now()}.txt`);
      
      // Write prompt to file
      fs.writeFile(promptFile, prompt.content, 'utf8').then(() => {
        const args = [pythonScript, promptFile];
        
        this.log.debug(`Executing: python ${args.join(' ')}`);

        const child = spawn('python', args, {
          cwd: this.config.bacardiPath,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONPATH: this.config.bacardiPath
          }
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        const timeout = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`LLM call timed out after ${this.config.timeout}ms`));
        }, this.config.timeout);

        child.on('close', (code) => {
          clearTimeout(timeout);
          
          // Cleanup prompt file
          fs.unlink(promptFile).catch(() => {});
          
          if (code === 0) {
            try {
              const response = JSON.parse(stdout);
              resolve({
                success: true,
                content: response.content || response.response || stdout,
                metadata: response.metadata || {}
              });
            } catch (parseError) {
              resolve({
                success: true,
                content: stdout,
                metadata: {}
              });
            }
          } else {
            reject(new Error(`LLM call failed with exit code ${code}: ${stderr}`));
          }
        });

        child.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      }).catch(reject);
    });
  }

  /**
   * Parse LLM response and extract fixes
   * @param {Object} llmResponse - LLM response
   * @param {Object} originalRequest - Original request
   * @returns {Promise<Array>} - Parsed fixes
   */
  async parseLLMResponse(llmResponse, originalRequest) {
    try {
      this.log.info(`📋 Parsing LLM response for fixes`);

      const fixes = [];
      
      for (const response of llmResponse.responses) {
        if (response.success) {
          const parsedFixes = await this.extractFixesFromResponse(response.content);
          fixes.push(...parsedFixes);
        }
      }

      // Validate and enrich fixes
      const validatedFixes = await this.validateFixes(fixes, originalRequest);
      
      return validatedFixes;
    } catch (error) {
      this.log.error(`❌ Failed to parse LLM response: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract fixes from LLM response content
   * @param {string} content - LLM response content
   * @returns {Promise<Array>} - Extracted fixes
   */
  async extractFixesFromResponse(content) {
    const fixes = [];
    
    try {
      // Try to parse as JSON first
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const jsonContent = JSON.parse(jsonMatch[1]);
        if (jsonContent.fixes) {
          return jsonContent.fixes;
        }
      }

      // Extract code blocks
      const codeBlocks = content.match(/```(?:java|kotlin)?\n([\s\S]*?)\n```/g);
      if (codeBlocks) {
        for (const block of codeBlocks) {
          const code = block.replace(/```(?:java|kotlin)?\n/, '').replace(/\n```$/, '');
          
          fixes.push({
            type: 'code_fix',
            language: 'java',
            content: code,
            description: 'Generated code fix',
            confidence: 0.8
          });
        }
      }

      // Extract file modifications
      const fileModifications = this.extractFileModifications(content);
      fixes.push(...fileModifications);

    } catch (error) {
      this.log.warn(`⚠️ Failed to extract structured fixes: ${error.message}`);
      
      // Fallback: treat entire response as a fix
      fixes.push({
        type: 'text_fix',
        content: content,
        description: 'LLM generated fix',
        confidence: 0.6
      });
    }

    return fixes;
  }

  /**
   * Extract file modifications from LLM response
   * @param {string} content - LLM response content
   * @returns {Array} - File modifications
   */
  extractFileModifications(content) {
    const modifications = [];
    
    // Look for file path patterns
    const filePatterns = [
      /(?:File|Path|Modify):\s*([^\n]+\.java)/gi,
      /(?:Update|Change)\s+([^\n]+\.java)/gi
    ];

    for (const pattern of filePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        modifications.push({
          type: 'file_modification',
          filePath: match[1],
          description: `Modify ${match[1]}`,
          confidence: 0.7
        });
      }
    }

    return modifications;
  }

  /**
   * Validate fixes against original request
   * @param {Array} fixes - Extracted fixes
   * @param {Object} originalRequest - Original request
   * @returns {Promise<Array>} - Validated fixes
   */
  async validateFixes(fixes, originalRequest) {
    const validatedFixes = [];
    
    for (const fix of fixes) {
      try {
        // Basic validation
        if (!fix.content || fix.content.trim().length === 0) {
          continue;
        }

        // Enrich with context
        const enrichedFix = {
          ...fix,
          id: `fix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          repository: originalRequest.repository,
          buildTool: originalRequest.buildTool,
          issues: originalRequest.issues.map(issue => issue.type),
          timestamp: new Date().toISOString()
        };

        validatedFixes.push(enrichedFix);
      } catch (error) {
        this.log.warn(`⚠️ Fix validation failed: ${error.message}`);
      }
    }

    return validatedFixes;
  }

  /**
   * Generate base prompt with build logs and errors
   * @param {Object} bacardiRequest - Bacardi request
   * @param {Object} codeAnalysis - Code analysis
   * @returns {Promise<Object>} - Base prompt
   */
  async generateBasePrompt(bacardiRequest, codeAnalysis) {
    const prompt = `
You are a Java dependency expert. A build failed due to dependency updates. 
Please analyze the build logs and generate fixes for the breaking changes.

Repository: ${bacardiRequest.repository}
Build Tool: ${bacardiRequest.buildTool}

Build Errors:
${codeAnalysis.errorMessages.join('\n')}

API Changes:
${codeAnalysis.apiDiffs.map(diff => `- ${diff.type}: ${diff.description}`).join('\n')}

Affected Files:
${codeAnalysis.affectedFiles.join('\n')}

Please provide specific code fixes in the following JSON format:
{
  "fixes": [
    {
      "type": "code_fix",
      "filePath": "path/to/file.java",
      "content": "fixed code content",
      "description": "description of the fix",
      "confidence": 0.9
    }
  ]
}
`;

    return {
      type: 'base_prompt',
      content: prompt.trim(),
      metadata: {
        repository: bacardiRequest.repository,
        buildTool: bacardiRequest.buildTool
      }
    };
  }

  /**
   * Generate issue-specific prompt
   * @param {Object} issue - Issue object
   * @param {Object} codeAnalysis - Code analysis
   * @returns {Promise<Object>} - Issue prompt
   */
  async generateIssuePrompt(issue, codeAnalysis) {
    const prompt = `
Fix this specific issue:

Issue Type: ${issue.type}
Error Message: ${issue.message}
Location: ${issue.location || 'Unknown'}

Context:
${issue.context || 'No additional context'}

Please provide a targeted fix for this specific issue.
`;

    return {
      type: 'issue_prompt',
      content: prompt.trim(),
      metadata: {
        issueType: issue.type,
        issueId: issue.id
      }
    };
  }

  /**
   * Run Bacardi extractor (placeholder - would integrate with actual extractor)
   * @param {Object} request - Request object
   * @returns {Promise<Object>} - Extractor result
   */
  async runBacardiExtractor(request) {
    // Placeholder implementation - would integrate with actual Bacardi extractor
    return {
      affectedFiles: [],
      codeSnippets: []
    };
  }

  /**
   * Extract API diffs (placeholder - would integrate with actual API diff extraction)
   * @param {Object} request - Request object
   * @returns {Promise<Array>} - API diffs
   */
  async extractApiDiffs(request) {
    // Placeholder implementation - would integrate with actual API diff extraction
    return [];
  }
}

/**
 * Base class for LLM processors
 */
class LLMProcessor {
  constructor(context, config) {
    this.context = context;
    this.log = context.log;
    this.config = config;
  }
}

/**
 * OpenAI processor
 */
class OpenAIProcessor extends LLMProcessor {
  async process(prompt) {
    // Implementation would use OpenAI API
    return { success: true, content: 'OpenAI response' };
  }
}

/**
 * Anthropic processor
 */
class AnthropicProcessor extends LLMProcessor {
  async process(prompt) {
    // Implementation would use Anthropic API
    return { success: true, content: 'Anthropic response' };
  }
}

/**
 * Gemini processor
 */
class GeminiProcessor extends LLMProcessor {
  async process(prompt) {
    // Implementation would use Gemini API
    return { success: true, content: 'Gemini response' };
  }
} 