/**
 * Compilation Risk Assessor for evaluating version change impact
 */
export class CompilationRiskAssessor {
  constructor() {
    this.highRiskElements = [
      'maven-compiler-plugin',
      'maven-surefire-plugin',
      'maven-failsafe-plugin',
      'maven-resources-plugin',
      'maven-war-plugin',
      'maven-jar-plugin'
    ];

    this.highRiskDependencies = [
      'org.springframework:spring-core',
      'org.springframework:spring-context',
      'org.springframework:spring-web',
      'org.springframework.boot:spring-boot-starter',
      'org.springframework.boot:spring-boot-starter-parent',
      'com.fasterxml.jackson.core:jackson-core',
      'com.fasterxml.jackson.core:jackson-databind',
      'org.apache.commons:commons-lang3',
      'org.slf4j:slf4j-api'
    ];

    this.mediumRiskDependencies = [
      'org.junit:junit',
      'org.mockito:mockito-core',
      'org.hamcrest:hamcrest',
      'org.assertj:assertj-core'
    ];
  }

  /**
   * Assess overall compilation risk for version changes
   * @param {Array} versionChanges - Array of version changes
   * @returns {Object} - Risk assessment result
   */
  assessRisk(versionChanges) {
    const riskFactors = [];
    let overallRisk = 'low';
    let totalRiskScore = 0;

    for (const change of versionChanges) {
      const factor = this.assessChangeRisk(change);
      riskFactors.push(factor);
      totalRiskScore += factor.score;
    }

    // Determine overall risk level
    if (totalRiskScore >= 8) {
      overallRisk = 'high';
    } else if (totalRiskScore >= 4) {
      overallRisk = 'medium';
    }

    return {
      level: overallRisk,
      score: totalRiskScore,
      factors: riskFactors,
      recommendations: this.generateRecommendations(riskFactors),
      summary: this.generateRiskSummary(riskFactors, overallRisk)
    };
  }

  /**
   * Assess risk for a single version change
   * @param {Object} change - Version change information
   * @returns {Object} - Risk factor assessment
   */
  assessChangeRisk(change) {
    const { context, significance, changeType } = change;
    let risk = 'low';
    let score = 0;
    let reasons = [];

    // Base risk from significance
    switch (significance) {
      case 'major':
        risk = 'high';
        score += 3;
        reasons.push('Major version upgrade');
        break;
      case 'removal':
        risk = 'high';
        score += 4;
        reasons.push('Dependency removal');
        break;
      case 'minor':
        risk = 'medium';
        score += 2;
        reasons.push('Minor version upgrade');
        break;
      case 'addition':
        risk = 'medium';
        score += 2;
        reasons.push('New dependency addition');
        break;
      case 'patch':
        risk = 'low';
        score += 1;
        reasons.push('Patch version upgrade');
        break;
      default:
        risk = 'low';
        score += 0;
        reasons.push('No significant change');
    }

    // Element-specific risk assessment
    if (context && context.elementType) {
      const elementRisk = this.assessElementRisk(context);
      if (elementRisk.risk === 'high') {
        risk = 'high';
        score += 2;
        reasons.push(elementRisk.reason);
      } else if (elementRisk.risk === 'medium' && risk === 'low') {
        risk = 'medium';
        score += 1;
        reasons.push(elementRisk.reason);
      }
    }

    // Dependency-specific risk assessment
    if (context && context.fullName) {
      const dependencyRisk = this.assessDependencyRisk(context.fullName);
      if (dependencyRisk.risk === 'high') {
        risk = 'high';
        score += 2;
        reasons.push(dependencyRisk.reason);
      } else if (dependencyRisk.risk === 'medium' && risk === 'low') {
        risk = 'medium';
        score += 1;
        reasons.push(dependencyRisk.reason);
      }
    }

    // Special cases
    if (changeType === 'removal' && context && context.elementType === 'dependency') {
      risk = 'high';
      score += 3;
      reasons.push('Critical dependency removal');
    }

    return {
      risk,
      score,
      reasons,
      change: change,
      element: context ? context.elementType : 'unknown',
      dependency: context ? context.fullName : 'unknown'
    };
  }

  /**
   * Assess risk based on element type
   * @param {Object} context - Element context
   * @returns {Object} - Element risk assessment
   */
  assessElementRisk(context) {
    const { elementType, artifactId } = context;

    switch (elementType) {
      case 'plugin':
        if (this.highRiskElements.includes(artifactId)) {
          return { risk: 'high', reason: `High-risk plugin: ${artifactId}` };
        }
        return { risk: 'medium', reason: 'Plugin version change' };

      case 'dependency':
        return { risk: 'medium', reason: 'Dependency version change' };

      case 'parent':
        return { risk: 'high', reason: 'Parent POM version change' };

      case 'property':
        return { risk: 'low', reason: 'Property version change' };

      default:
        return { risk: 'low', reason: 'Unknown element type' };
    }
  }

  /**
   * Assess risk based on specific dependency
   * @param {string} dependencyName - Full dependency name (groupId:artifactId)
   * @returns {Object} - Dependency risk assessment
   */
  assessDependencyRisk(dependencyName) {
    if (this.highRiskDependencies.includes(dependencyName)) {
      return { risk: 'high', reason: `High-risk dependency: ${dependencyName}` };
    }
    
    if (this.mediumRiskDependencies.includes(dependencyName)) {
      return { risk: 'medium', reason: `Medium-risk dependency: ${dependencyName}` };
    }

    // Check for common patterns
    if (dependencyName.includes('spring')) {
      return { risk: 'medium', reason: 'Spring framework dependency' };
    }

    if (dependencyName.includes('jackson')) {
      return { risk: 'medium', reason: 'Jackson dependency' };
    }

    if (dependencyName.includes('junit') || dependencyName.includes('test')) {
      return { risk: 'low', reason: 'Test dependency' };
    }

    return { risk: 'low', reason: 'Standard dependency' };
  }

  /**
   * Generate recommendations based on risk factors
   * @param {Array} riskFactors - Array of risk factors
   * @returns {Array} - Array of recommendations
   */
  generateRecommendations(riskFactors) {
    const recommendations = [];

    // High-risk recommendations
    const highRiskFactors = riskFactors.filter(f => f.risk === 'high');
    if (highRiskFactors.length > 0) {
      recommendations.push({
        priority: 'high',
        action: 'Run full compilation analysis',
        reason: `${highRiskFactors.length} high-risk changes detected`
      });

      const majorUpgrades = highRiskFactors.filter(f => 
        f.change.significance === 'major'
      );
      if (majorUpgrades.length > 0) {
        recommendations.push({
          priority: 'high',
          action: 'Review breaking changes documentation',
          reason: `${majorUpgrades.length} major version upgrades detected`
        });
      }

      const removals = highRiskFactors.filter(f => 
        f.change.changeType === 'removal'
      );
      if (removals.length > 0) {
        recommendations.push({
          priority: 'high',
          action: 'Verify no code depends on removed dependencies',
          reason: `${removals.length} dependency removals detected`
        });
      }
    }

    // Medium-risk recommendations
    const mediumRiskFactors = riskFactors.filter(f => f.risk === 'medium');
    if (mediumRiskFactors.length > 0) {
      recommendations.push({
        priority: 'medium',
        action: 'Run compilation tests',
        reason: `${mediumRiskFactors.length} medium-risk changes detected`
      });
    }

    // General recommendations
    if (riskFactors.length > 0) {
      recommendations.push({
        priority: 'low',
        action: 'Review changelog for affected dependencies',
        reason: 'Version changes may include important updates'
      });
    }

    return recommendations;
  }

  /**
   * Generate risk summary
   * @param {Array} riskFactors - Array of risk factors
   * @param {string} overallRisk - Overall risk level
   * @returns {string} - Risk summary
   */
  generateRiskSummary(riskFactors, overallRisk) {
    const highCount = riskFactors.filter(f => f.risk === 'high').length;
    const mediumCount = riskFactors.filter(f => f.risk === 'medium').length;
    const lowCount = riskFactors.filter(f => f.risk === 'low').length;

    let summary = `Overall risk: ${overallRisk.toUpperCase()}`;
    
    if (highCount > 0) {
      summary += ` (${highCount} high-risk, ${mediumCount} medium-risk, ${lowCount} low-risk changes)`;
    } else if (mediumCount > 0) {
      summary += ` (${mediumCount} medium-risk, ${lowCount} low-risk changes)`;
    } else {
      summary += ` (${lowCount} low-risk changes)`;
    }

    return summary;
  }

  /**
   * Check if changes should trigger full analysis
   * @param {Array} versionChanges - Array of version changes
   * @param {Object} config - Configuration options
   * @returns {boolean} - True if full analysis should be triggered
   */
  shouldTriggerFullAnalysis(versionChanges, config = {}) {
    const { triggerAnalysis = ['medium', 'high'] } = config;
    
    const riskAssessment = this.assessRisk(versionChanges);
    
    return triggerAnalysis.includes(riskAssessment.level);
  }

  /**
   * Get risk level description
   * @param {string} riskLevel - Risk level
   * @returns {string} - Risk level description
   */
  getRiskDescription(riskLevel) {
    const descriptions = {
      'high': 'High risk - Likely to cause compilation issues',
      'medium': 'Medium risk - May cause compilation issues',
      'low': 'Low risk - Unlikely to cause compilation issues'
    };

    return descriptions[riskLevel] || 'Unknown risk level';
  }
}
