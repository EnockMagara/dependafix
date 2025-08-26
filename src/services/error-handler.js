/**
 * Comprehensive error handling and edge case management service
 */
export class ErrorHandler {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
    this.errorCounts = new Map();
    this.retryAttempts = new Map();
  }

  /**
   * Handle errors with appropriate recovery strategies
   * @param {Error} error - The error to handle
   * @param {string} operation - Operation that failed
   * @param {Object} context - Additional context
   * @returns {Object} - Error handling result
   */
  async handleError(error, operation, context = {}) {
    const errorKey = `${operation}_${error.name}`;
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);

    this.log.error(`❌ Error in ${operation}: ${error.message}`);
    this.log.error(`Stack trace: ${error.stack}`);

    // Categorize error and determine recovery strategy
    const errorCategory = this.categorizeError(error);
    const recoveryStrategy = this.determineRecoveryStrategy(errorCategory, currentCount);

    const result = {
      handled: false,
      recoverable: false,
      retry: false,
      fallback: null,
      error: error.message,
      category: errorCategory,
      operation,
      context
    };

    try {
      switch (recoveryStrategy) {
        case 'retry':
          result.retry = true;
          result.recoverable = true;
          break;

        case 'fallback':
          result.fallback = await this.executeFallbackStrategy(errorCategory, context);
          result.recoverable = true;
          break;

        case 'graceful_degradation':
          result.handled = true;
          result.recoverable = true;
          result.fallback = await this.executeGracefulDegradation(errorCategory, context);
          break;

        case 'abort':
          result.handled = true;
          result.recoverable = false;
          break;

        default:
          result.handled = true;
          result.recoverable = false;
      }
    } catch (recoveryError) {
      this.log.error(`❌ Error recovery failed: ${recoveryError.message}`);
      result.handled = true;
      result.recoverable = false;
    }

    return result;
  }

  /**
   * Categorize error based on type and message
   * @param {Error} error - The error to categorize
   * @returns {string} - Error category
   */
  categorizeError(error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network and API errors
    if (name.includes('network') || name.includes('timeout') || 
        message.includes('network') || message.includes('timeout') ||
        message.includes('econnreset') || message.includes('enotfound')) {
      return 'network_error';
    }

    // GitHub API errors
    if (name.includes('octokit') || message.includes('api') ||
        message.includes('rate limit') || message.includes('403') ||
        message.includes('404') || message.includes('500')) {
      return 'api_error';
    }

    // File system errors
    if (name.includes('fs') || message.includes('file') ||
        message.includes('directory') || message.includes('permission')) {
      return 'filesystem_error';
    }

    // Git operations errors
    if (message.includes('git') || message.includes('clone') ||
        message.includes('checkout') || message.includes('fetch')) {
      return 'git_error';
    }

    // Build and compilation errors
    if (message.includes('maven') || message.includes('compile') ||
        message.includes('build') || message.includes('dependency')) {
      return 'build_error';
    }

    // Parsing and validation errors
    if (message.includes('parse') || message.includes('json') ||
        message.includes('xml') || message.includes('syntax')) {
      return 'parsing_error';
    }

    // Memory and resource errors
    if (message.includes('memory') || message.includes('heap') ||
        message.includes('resource') || message.includes('disk')) {
      return 'resource_error';
    }

    return 'unknown_error';
  }

  /**
   * Determine recovery strategy based on error category and retry count
   * @param {string} errorCategory - Error category
   * @param {number} retryCount - Number of previous retries
   * @returns {string} - Recovery strategy
   */
  determineRecoveryStrategy(errorCategory, retryCount) {
    const maxRetries = this.getMaxRetriesForCategory(errorCategory);

    if (retryCount < maxRetries) {
      return 'retry';
    }

    switch (errorCategory) {
      case 'network_error':
        return retryCount < 3 ? 'retry' : 'fallback';
      
      case 'api_error':
        return retryCount < 2 ? 'retry' : 'graceful_degradation';
      
      case 'filesystem_error':
        return 'fallback';
      
      case 'git_error':
        return retryCount < 2 ? 'retry' : 'fallback';
      
      case 'build_error':
        return 'graceful_degradation';
      
      case 'parsing_error':
        return 'fallback';
      
      case 'resource_error':
        return 'abort';
      
      default:
        return 'graceful_degradation';
    }
  }

  /**
   * Get maximum retries for error category
   * @param {string} errorCategory - Error category
   * @returns {number} - Maximum retries
   */
  getMaxRetriesForCategory(errorCategory) {
    const retryLimits = {
      network_error: 3,
      api_error: 2,
      filesystem_error: 1,
      git_error: 2,
      build_error: 1,
      parsing_error: 1,
      resource_error: 0,
      unknown_error: 1
    };

    return retryLimits[errorCategory] || 1;
  }

  /**
   * Execute fallback strategy for error category
   * @param {string} errorCategory - Error category
   * @param {Object} context - Error context
   * @returns {Object} - Fallback result
   */
  async executeFallbackStrategy(errorCategory, context) {
    switch (errorCategory) {
      case 'network_error':
        return await this.handleNetworkErrorFallback(context);
      
      case 'api_error':
        return await this.handleApiErrorFallback(context);
      
      case 'filesystem_error':
        return await this.handleFilesystemErrorFallback(context);
      
      case 'git_error':
        return await this.handleGitErrorFallback(context);
      
      case 'parsing_error':
        return await this.handleParsingErrorFallback(context);
      
      default:
        return { success: false, message: 'No fallback strategy available' };
    }
  }

  /**
   * Execute graceful degradation for error category
   * @param {string} errorCategory - Error category
   * @param {Object} context - Error context
   * @returns {Object} - Degradation result
   */
  async executeGracefulDegradation(errorCategory, context) {
    switch (errorCategory) {
      case 'api_error':
        return await this.degradeApiFunctionality(context);
      
      case 'build_error':
        return await this.degradeBuildAnalysis(context);
      
      default:
        return { success: true, message: 'Graceful degradation applied' };
    }
  }

  /**
   * Handle network error fallback
   * @param {Object} context - Error context
   * @returns {Object} - Fallback result
   */
  async handleNetworkErrorFallback(context) {
    this.log.info('🔄 Attempting network error fallback...');
    
    // Wait before retry
    await this.delay(5000);
    
    return {
      success: true,
      message: 'Network error fallback: delayed retry',
      retryAfter: 5000
    };
  }

  /**
   * Handle API error fallback
   * @param {Object} context - Error context
   * @returns {Object} - Fallback result
   */
  async handleApiErrorFallback(context) {
    this.log.info('🔄 Attempting API error fallback...');
    
    // Try to use cached data or alternative endpoints
    if (context.cacheKey) {
      const cachedData = await this.getCachedData(context.cacheKey);
      if (cachedData) {
        return {
          success: true,
          message: 'Using cached data due to API error',
          data: cachedData,
          source: 'cache'
        };
      }
    }
    
    return {
      success: false,
      message: 'No fallback data available for API error'
    };
  }

  /**
   * Handle filesystem error fallback
   * @param {Object} context - Error context
   * @returns {Object} - Fallback result
   */
  async handleFilesystemErrorFallback(context) {
    this.log.info('🔄 Attempting filesystem error fallback...');
    
    // Try alternative directory or file path
    if (context.alternativePath) {
      return {
        success: true,
        message: 'Using alternative path due to filesystem error',
        path: context.alternativePath
      };
    }
    
    return {
      success: false,
      message: 'No alternative path available'
    };
  }

  /**
   * Handle git error fallback
   * @param {Object} context - Error context
   * @returns {Object} - Fallback result
   */
  async handleGitErrorFallback(context) {
    this.log.info('🔄 Attempting git error fallback...');
    
    // Try shallow clone or different branch
    if (context.repository) {
      return {
        success: true,
        message: 'Using shallow clone fallback for git error',
        strategy: 'shallow_clone'
      };
    }
    
    return {
      success: false,
      message: 'No git fallback strategy available'
    };
  }

  /**
   * Handle parsing error fallback
   * @param {Object} context - Error context
   * @returns {Object} - Fallback result
   */
  async handleParsingErrorFallback(context) {
    this.log.info('🔄 Attempting parsing error fallback...');
    
    // Try alternative parsing method or skip problematic content
    if (context.content) {
      const sanitizedContent = this.sanitizeContent(context.content);
      return {
        success: true,
        message: 'Using sanitized content due to parsing error',
        content: sanitizedContent
      };
    }
    
    return {
      success: false,
      message: 'No parsing fallback available'
    };
  }

  /**
   * Degrade API functionality
   * @param {Object} context - Error context
   * @returns {Object} - Degradation result
   */
  async degradeApiFunctionality(context) {
    this.log.info('📉 Degrading API functionality...');
    
    // Reduce API calls or use simpler endpoints
    return {
      success: true,
      message: 'API functionality degraded - using basic endpoints only',
      degradedFeatures: ['detailed_analysis', 'real_time_updates'],
      availableFeatures: ['basic_analysis', 'cached_data']
    };
  }

  /**
   * Degrade build analysis
   * @param {Object} context - Error context
   * @returns {Object} - Degradation result
   */
  async degradeBuildAnalysis(context) {
    this.log.info('📉 Degrading build analysis...');
    
    // Use static analysis instead of full build
    return {
      success: true,
      message: 'Build analysis degraded - using static analysis only',
      degradedFeatures: ['full_build', 'test_execution'],
      availableFeatures: ['static_analysis', 'dependency_scanning']
    };
  }

  /**
   * Get cached data
   * @param {string} cacheKey - Cache key
   * @returns {Object|null} - Cached data or null
   */
  async getCachedData(cacheKey) {
    // Implementation would depend on caching strategy
    // For now, return null
    return null;
  }

  /**
   * Sanitize content for parsing
   * @param {string} content - Content to sanitize
   * @returns {string} - Sanitized content
   */
  sanitizeContent(content) {
    // Remove problematic characters or sections
    return content
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .replace(/<!--[\s\S]*?-->/g, '') // Remove XML comments
      .trim();
  }

  /**
   * Delay execution
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if operation should be retried
   * @param {string} operation - Operation name
   * @returns {boolean} - True if should retry
   */
  shouldRetry(operation) {
    const attempts = this.retryAttempts.get(operation) || 0;
    const maxAttempts = 3;
    
    if (attempts < maxAttempts) {
      this.retryAttempts.set(operation, attempts + 1);
      return true;
    }
    
    return false;
  }

  /**
   * Reset retry attempts for operation
   * @param {string} operation - Operation name
   */
  resetRetryAttempts(operation) {
    this.retryAttempts.delete(operation);
  }

  /**
   * Get error statistics
   * @returns {Object} - Error statistics
   */
  getErrorStatistics() {
    const stats = {
      totalErrors: 0,
      byCategory: {},
      byOperation: {},
      mostCommon: []
    };

    for (const [key, count] of this.errorCounts) {
      const [operation, category] = key.split('_');
      stats.totalErrors += count;
      
      stats.byCategory[category] = (stats.byCategory[category] || 0) + count;
      stats.byOperation[operation] = (stats.byOperation[operation] || 0) + count;
    }

    // Get most common errors
    stats.mostCommon = Array.from(this.errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => ({ key, count }));

    return stats;
  }

  /**
   * Clear error statistics
   */
  clearErrorStatistics() {
    this.errorCounts.clear();
    this.retryAttempts.clear();
  }
}
