/**
 * Enhanced Byam client for MVP - focuses on high-accuracy dependency analysis
 */
export class ByamClient {
  constructor() {
    // For MVP, we'll use a sophisticated pattern-based approach
    // In the full implementation, this would connect to the Bacardi system
  }

  /**
   * Analyze compilation errors to determine if they are dependency-related
   * @param {Array} compilationErrors - Array of compilation errors
   * @returns {Array} - Analysis results with dependency relationship info
   */
  async analyzeCompilationErrors(compilationErrors) {
    const results = [];
    
    for (const error of compilationErrors) {
      const analysis = await this.analyzeSingleError(error);
      results.push({
        ...error,
        isDependencyRelated: analysis.isDependencyRelated,
        confidence: analysis.confidence,
        suggestedAction: analysis.suggestedAction,
        dependencyType: analysis.dependencyType,
        severity: analysis.severity
      });
    }
    
    // Return all errors with analysis, don't filter
    return results;
  }

  /**
   * Analyze a single compilation error with high accuracy
   * @param {Object} error - The compilation error
   * @returns {Object} - Analysis result
   */
  async analyzeSingleError(error) {
    // High-confidence dependency-related error patterns
    const dependencyPatterns = [
      {
        pattern: /cannot find symbol/,
        type: 'missing_symbol',
        confidence: 95,
        dependencyType: 'removed_class_or_method',
        severity: 'high'
      },
      {
        pattern: /package .* does not exist/,
        type: 'missing_package',
        confidence: 95,
        dependencyType: 'removed_package',
        severity: 'high'
      },
      {
        pattern: /class .* not found/,
        type: 'missing_class',
        confidence: 90,
        dependencyType: 'removed_class',
        severity: 'high'
      },
      {
        pattern: /NoClassDefFoundError/,
        type: 'class_def_not_found',
        confidence: 90,
        dependencyType: 'runtime_class_missing',
        severity: 'high'
      },
      {
        pattern: /ClassNotFoundException/,
        type: 'class_not_found_exception',
        confidence: 90,
        dependencyType: 'runtime_class_missing',
        severity: 'high'
      },
      {
        pattern: /incompatible types/,
        type: 'type_mismatch',
        confidence: 85,
        dependencyType: 'api_signature_change',
        severity: 'medium'
      },
      {
        pattern: /method .* cannot be applied/,
        type: 'method_signature_error',
        confidence: 85,
        dependencyType: 'api_signature_change',
        severity: 'medium'
      },
      {
        pattern: /deprecated/,
        type: 'deprecated_api',
        confidence: 80,
        dependencyType: 'deprecated_api',
        severity: 'medium'
      },
      {
        pattern: /BUILD FAILURE/,
        type: 'build_failure',
        confidence: 75,
        dependencyType: 'build_issue',
        severity: 'medium'
      },
      {
        pattern: /COMPILATION ERROR/,
        type: 'compilation_error',
        confidence: 70,
        dependencyType: 'general_compilation',
        severity: 'medium'
      }
    ];
    
    const lowerMessage = error.message.toLowerCase();
    let bestMatch = null;
    let highestConfidence = 0;
    
    // Find the best matching pattern
    for (const pattern of dependencyPatterns) {
      if (pattern.pattern.test(lowerMessage)) {
        if (pattern.confidence > highestConfidence) {
          highestConfidence = pattern.confidence;
          bestMatch = pattern;
        }
      }
    }
    
    // Additional context-based analysis
    const contextConfidence = this.analyzeContext(error);
    
    const isDependencyRelated = bestMatch !== null && highestConfidence >= 70;
    const finalConfidence = isDependencyRelated ? 
      Math.min(100, highestConfidence + contextConfidence) : 
      Math.max(0, highestConfidence - 20);
    
    let suggestedAction = 'Manual review required';
    let dependencyType = 'unknown';
    let severity = 'low';
    
    if (bestMatch) {
      dependencyType = bestMatch.dependencyType;
      severity = bestMatch.severity;
      suggestedAction = this.getSuggestedAction(bestMatch.type, error);
    }
    
    return {
      isDependencyRelated,
      confidence: finalConfidence,
      suggestedAction,
      dependencyType,
      severity
    };
  }

  /**
   * Analyze context to improve confidence
   * @param {Object} error - The error object
   * @returns {number} - Confidence boost from context
   */
  analyzeContext(error) {
    let contextConfidence = 0;
    
    // Check if error is from a build log (higher confidence)
    if (error.file && (error.file.includes('.log') || error.file.includes('build'))) {
      contextConfidence += 10;
    }
    
    // Check if error has high confidence from detection
    if (error.confidence && error.confidence >= 80) {
      contextConfidence += 5;
    }
    
    // Check if error is from recent commits (more likely dependency-related)
    if (error.commit) {
      contextConfidence += 5;
    }
    
    // Check if error message contains specific dependency indicators
    const dependencyIndicators = [
      'dependency', 'version', 'update', 'upgrade', 'breaking', 'incompatible'
    ];
    
    const lowerMessage = error.message.toLowerCase();
    const hasDependencyIndicators = dependencyIndicators.some(indicator => 
      lowerMessage.includes(indicator)
    );
    
    if (hasDependencyIndicators) {
      contextConfidence += 10;
    }
    
    return contextConfidence;
  }

  /**
   * Get suggested action based on error type
   * @param {string} errorType - Type of error
   * @param {Object} error - Error object
   * @returns {string} - Suggested action
   */
  getSuggestedAction(errorType, error) {
    switch (errorType) {
      case 'missing_symbol':
      case 'missing_class':
      case 'missing_package':
        return 'Check if dependency was removed or renamed in newer version';
      
      case 'class_def_not_found':
      case 'class_not_found_exception':
        return 'Check if runtime dependency is missing or version incompatible';
      
      case 'type_mismatch':
      case 'method_signature_error':
        return 'Check if API signature changed in dependency update';
      
      case 'deprecated_api':
        return 'Replace deprecated API usage with recommended alternative';
      
      case 'build_failure':
        return 'Check dependency compatibility and build configuration';
      
      case 'compilation_error':
        return 'Review compilation errors for dependency-related issues';
      
      default:
        return 'Manual investigation required';
    }
  }

  /**
   * Get detailed analysis for dependency-related errors
   * @param {Object} error - The error to analyze
   * @returns {Object} - Detailed analysis
   */
  async getDetailedAnalysis(error) {
    const analysis = await this.analyzeSingleError(error);
    
    return {
      errorType: this.categorizeError(error.message),
      severity: analysis.severity,
      dependencyType: analysis.dependencyType,
      potentialCauses: this.identifyPotentialCauses(error.message, analysis.dependencyType),
      recommendedApproach: analysis.suggestedAction,
      confidence: analysis.confidence
    };
  }

  /**
   * Categorize the error type
   * @param {string} message - Error message
   * @returns {string} - Error category
   */
  categorizeError(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('cannot find symbol') || lowerMessage.includes('class not found')) {
      return 'MissingClass';
    }
    
    if (lowerMessage.includes('package does not exist')) {
      return 'MissingPackage';
    }
    
    if (lowerMessage.includes('incompatible types')) {
      return 'TypeMismatch';
    }
    
    if (lowerMessage.includes('method cannot be applied')) {
      return 'MethodSignature';
    }
    
    if (lowerMessage.includes('deprecated')) {
      return 'DeprecatedAPI';
    }
    
    if (lowerMessage.includes('build failure')) {
      return 'BuildFailure';
    }
    
    return 'Unknown';
  }

  /**
   * Identify potential causes based on error type
   * @param {string} message - Error message
   * @param {string} dependencyType - Dependency type
   * @returns {Array} - Potential causes
   */
  identifyPotentialCauses(message, dependencyType) {
    const causes = [];
    const lowerMessage = message.toLowerCase();
    
    switch (dependencyType) {
      case 'removed_class_or_method':
      case 'removed_class':
      case 'removed_package':
        causes.push('Dependency was removed in newer version');
        causes.push('Class/method was renamed or moved');
        causes.push('Package structure changed');
        break;
      
      case 'runtime_class_missing':
        causes.push('Runtime dependency is missing');
        causes.push('Dependency version is incompatible');
        causes.push('Transitive dependency issue');
        break;
      
      case 'api_signature_change':
        causes.push('API signature changed in dependency update');
        causes.push('Method parameters or return type changed');
        causes.push('Method was removed or renamed');
        break;
      
      case 'deprecated_api':
        causes.push('API was deprecated in newer version');
        causes.push('Replacement API available');
        break;
      
      case 'build_issue':
        causes.push('Build tool version incompatibility');
        causes.push('Plugin version mismatch');
        causes.push('Configuration issue');
        break;
      
      default:
        if (lowerMessage.includes('cannot find symbol') || lowerMessage.includes('class not found')) {
          causes.push('Dependency was removed in newer version');
          causes.push('Class was renamed or moved');
          causes.push('Package structure changed');
        }
        
        if (lowerMessage.includes('incompatible types') || lowerMessage.includes('method cannot be applied')) {
          causes.push('API signature changed in dependency update');
          causes.push('Method parameters or return type changed');
          causes.push('Method was removed or renamed');
        }
        
        if (lowerMessage.includes('deprecated')) {
          causes.push('API was deprecated in newer version');
          causes.push('Replacement API available');
        }
    }
    
    return causes;
  }

  /**
   * Get recommended approach
   * @param {string} message - Error message
   * @returns {string} - Recommended approach
   */
  getRecommendedApproach(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('cannot find symbol') || lowerMessage.includes('class not found')) {
      return 'Check dependency documentation for migration guide';
    }
    
    if (lowerMessage.includes('incompatible types') || lowerMessage.includes('method cannot be applied')) {
      return 'Update method calls to match new API signature';
    }
    
    if (lowerMessage.includes('deprecated')) {
      return 'Replace deprecated API with recommended alternative';
    }
    
    if (lowerMessage.includes('build failure')) {
      return 'Check dependency compatibility and update build configuration';
    }
    
    return 'Manual investigation required';
  }
}
