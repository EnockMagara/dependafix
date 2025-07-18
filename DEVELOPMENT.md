# Development Guide

This guide provides comprehensive instructions for developing, testing, and maintaining the Dependafix Bot.

## Table of Contents

1. [Project Structure](#project-structure)
2. [Development Setup](#development-setup)
3. [Architecture Patterns](#architecture-patterns)
4. [Testing Strategy](#testing-strategy)
5. [Mock Development](#mock-development)
6. [Build Validation](#build-validation)
7. [Code Quality](#code-quality)
8. [Debugging](#debugging)
9. [Performance](#performance)
10. [Deployment](#deployment)

## Project Structure

```
dependafix-bot/
├── src/
│   ├── index.js                    # Main application entry point
│   ├── handlers/                   # Webhook event handlers
│   ├── services/                   # Core business logic
│   │   ├── dependafix/            # Main service orchestration
│   │   ├── use-cases/             # 5 use case handlers
│   │   ├── build-validator.js     # Build validation service
│   │   ├── byam/                  # LLM integration
│   │   └── utils/                 # Utility functions
│   └── utils/                     # Shared utilities
├── test/
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   └── mock/                      # Mock services
├── docs/                          # Documentation
└── config/                        # Configuration files
```

## Development Setup

### 1. Environment Setup

```bash
# Clone and setup
git clone https://github.com/your-org/dependafix-bot.git
cd dependafix-bot
npm install

# Copy environment template
cp env.example .env

# Install development tools
npm install -g nodemon
```

### 2. Required Services

For full functionality, you'll need:

- **GitHub App**: For webhook processing
- **Byam LLM Service**: For intelligent fix generation
- **Build Tools**: Maven/Gradle for validation

### 3. Development Mode

```bash
# Start with hot reload
npm run dev

# Start with mock services
MOCK_MODE=true npm run dev

# Start mock server separately
npm run mock:server
```

## Architecture Patterns

### 1. Service-Oriented Architecture

Each major component is a separate service with clear responsibilities:

```javascript
// Service pattern example
class DependafixService {
  constructor(context, config) {
    this.context = context;
    this.config = config;
    this.orchestrator = new UseCaseOrchestrator(context, config);
    this.buildValidator = new BuildValidator(context, config);
  }

  async processDependencyUpdate(options) {
    // Orchestrate the entire workflow
  }
}
```

### 2. Strategy Pattern for Use Cases

Each use case implements a common interface:

```javascript
class UseCase {
  async analyze(context) {
    // Analyze if this use case applies
  }

  async generateFixes(context) {
    // Generate fixes for this use case
  }

  async applyFixes(context, fixes) {
    // Apply the generated fixes
  }
}
```

### 3. Repository Pattern for Data Access

```javascript
class RepositoryManager {
  async checkoutRepository(repositoryUrl, branch) {
    // Repository operations
  }

  async getFileContents(filePath) {
    // File operations
  }
}
```

### 4. Factory Pattern for Build Tools

```javascript
class BuildRunnerFactory {
  static createBuildRunner(buildTool) {
    switch (buildTool) {
      case 'maven':
        return new MavenBuildRunner();
      case 'gradle':
        return new GradleBuildRunner();
      default:
        throw new Error(`Unsupported build tool: ${buildTool}`);
    }
  }
}
```

## Testing Strategy

### 1. Test Pyramid

```
    ┌─────────────┐
    │   E2E (5%)  │  ← Full webhook simulation
    ├─────────────┤
    │ Integration │  ← Service integration tests
    │    (25%)    │
    ├─────────────┤
    │ Unit (70%)  │  ← Component unit tests
    └─────────────┘
```

### 2. Test Categories

#### Unit Tests (`test/unit/`)
- Test individual components in isolation
- Mock all external dependencies
- Fast execution (< 1s per test)

```javascript
describe('BuildValidator', () => {
  let buildValidator;
  let mockContext;

  beforeEach(() => {
    mockContext = {
      log: {
        info: sinon.stub(),
        error: sinon.stub()
      }
    };
    buildValidator = new BuildValidator(mockContext);
  });

  it('should validate successful builds', async () => {
    sinon.stub(buildValidator, 'runCleanBuild').resolves({
      success: true,
      logs: '[INFO] BUILD SUCCESS'
    });

    const result = await buildValidator.validateFixes('./test-repo', 'maven', {});
    expect(result.buildPassed).to.be.true;
  });
});
```

#### Integration Tests (`test/integration/`)
- Test complete workflows
- Use mock external services
- Validate service interactions

```javascript
describe('Webhook Integration', () => {
  let mockServer;
  let dependafixService;

  before(async () => {
    mockServer = new MockServer(3002);
    await mockServer.start();
    dependafixService = new DependafixService(mockContext, {
      byam: { endpoint: 'http://localhost:3002/api/byam' }
    });
  });

  it('should process PR webhooks end-to-end', async () => {
    const result = await dependafixService.processWebhookEvent('pull_request', payload);
    expect(result.success).to.be.true;
    expect(result.buildValidated).to.be.true;
  });
});
```

### 3. Test Data Management

Create realistic test data:

```javascript
// test/fixtures/sample-pom.xml
const samplePom = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>5.3.0</version>
    </dependency>
  </dependencies>
</project>`;

// test/fixtures/build-logs.js
export const buildLogs = {
  deprecatedMethod: '[WARNING] getInstance() in OldUtil has been deprecated',
  compilationError: '[ERROR] cannot find symbol method processData(String)',
  testFailure: 'Tests run: 25, Failures: 2, Errors: 0, Skipped: 0'
};
```

## Mock Development

### 1. Mock Server Architecture

The mock server (`test/mock/mock-server.js`) provides:

- **GitHub API Simulation**: Repository operations, PR creation
- **Byam LLM Simulation**: Fix generation with realistic responses
- **Build Process Simulation**: Maven/Gradle execution with configurable outcomes

### 2. Mock Configuration

```javascript
// Configure mock behavior
const mockServer = new MockServer(3001);

// Override specific endpoints
mockServer.app.post('/api/byam/generate-fixes', (req, res) => {
  const { type } = req.body;
  res.json({
    success: true,
    fixes: generateMockFixes(type),
    confidence: 0.85
  });
});
```

### 3. Webhook Simulation

```javascript
// Simulate different webhook scenarios
const simulator = new WebhookSimulator('http://localhost:3000');

// Test specific scenarios
await simulator.simulatePullRequestOpened();
await simulator.simulatePushWithDependencyChanges();
await simulator.simulateIssueComment();
```

## Build Validation

### 1. Validation Pipeline

The build validation follows a 5-phase process:

1. **Clean Build**: Compile without tests
2. **Test Execution**: Run test suite
3. **Dependency Validation**: Check dependency consistency
4. **Quality Checks**: Code quality metrics
5. **PR Decision**: Determine if PR should be created

### 2. Validation Rules

```javascript
const validationRules = {
  // Build must always pass
  buildRequired: true,
  
  // Test failure thresholds
  testFailureThreshold: 0.2,        // 20% for general updates
  criticalTestFailureThreshold: 0.05, // 5% for critical updates
  
  // Dependency-related failures block PR
  dependencyFailuresBlock: true,
  
  // Quality check warnings allowed
  qualityWarningsAllowed: true
};
```

### 3. Custom Validation Logic

```javascript
class BuildValidator {
  async validateFixes(repoPath, buildTool, fixContext) {
    const results = {
      buildPassed: false,
      testsPassed: false,
      shouldCreatePR: false,
      errors: [],
      warnings: []
    };

    // Phase 1: Clean build
    const buildResult = await this.runCleanBuild(repoPath, buildTool);
    results.buildPassed = buildResult.success;

    if (!results.buildPassed) {
      results.errors.push('Clean build failed');
      return results;
    }

    // Phase 2: Test execution
    const testResult = await this.runTests(repoPath, buildTool);
    const testAnalysis = this.analyzeTestFailures(testResult);
    
    results.testsPassed = testAnalysis.canProceed;
    results.shouldCreatePR = this.shouldCreatePullRequest(results, fixContext);

    return results;
  }
}
```

## Code Quality

### 1. Linting Configuration

ESLint configuration enforces:
- Consistent code style
- Best practices
- Error prevention
- Modern JavaScript features

```javascript
// .eslintrc.js
module.exports = {
  extends: ['eslint:recommended'],
  rules: {
    'no-console': 'off',
    'prefer-const': 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
  }
};
```

### 2. Code Formatting

Prettier configuration:
- Consistent formatting
- Automatic code style
- Integration with editors

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

### 3. Quality Checks

```bash
# Run all quality checks
npm run validate

# Individual checks
npm run lint
npm run format
npm run test:coverage
```

## Debugging

### 1. Debug Configuration

```bash
# Enable debug logging
export LOG_LEVEL=debug
npm run dev

# Enable mock mode
export MOCK_MODE=true
npm run dev

# Debug specific components
export DEBUG=dependafix:*
npm run dev
```

### 2. Debug Tools

```javascript
// Add debug logging
import debug from 'debug';
const log = debug('dependafix:build-validator');

class BuildValidator {
  async validateFixes(repoPath, buildTool, fixContext) {
    log('Starting build validation for %s', repoPath);
    log('Build tool: %s', buildTool);
    log('Fix context: %O', fixContext);
    
    // ... validation logic
  }
}
```

### 3. Test Debugging

```bash
# Run specific test with debug
DEBUG=dependafix:* npm test -- --grep "should validate builds"

# Run with verbose output
npm test -- --reporter spec

# Debug webhook simulation
node --inspect test/mock/webhook-simulator.js
```

## Performance

### 1. Performance Monitoring

```javascript
class PerformanceMonitor {
  static async measureOperation(name, operation) {
    const start = Date.now();
    try {
      const result = await operation();
      const duration = Date.now() - start;
      console.log(`${name} completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`${name} failed after ${duration}ms: ${error.message}`);
      throw error;
    }
  }
}

// Usage
const result = await PerformanceMonitor.measureOperation(
  'Build Validation',
  () => buildValidator.validateFixes(repoPath, buildTool, fixContext)
);
```

### 2. Optimization Strategies

- **Parallel Processing**: Run independent operations concurrently
- **Caching**: Cache build results and dependency information
- **Timeouts**: Set appropriate timeouts for external operations
- **Resource Limits**: Limit concurrent operations

```javascript
// Parallel test execution
const [buildResult, testResult, dependencyResult] = await Promise.all([
  this.runCleanBuild(repoPath, buildTool),
  this.runTests(repoPath, buildTool),
  this.validateDependencies(repoPath, buildTool)
]);
```

## Deployment

### 1. Environment Configuration

```bash
# Production environment
NODE_ENV=production
LOG_LEVEL=info
MOCK_MODE=false

# GitHub configuration
GITHUB_TOKEN=prod_token
GITHUB_WEBHOOK_SECRET=prod_secret

# Byam configuration
BYAM_ENDPOINT=https://api.byam.ai/v1
BYAM_API_KEY=prod_api_key
```

### 2. Health Checks

```javascript
// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      github: await checkGitHubConnection(),
      byam: await checkByamConnection(),
      database: await checkDatabaseConnection()
    }
  };
  
  res.json(health);
});
```

### 3. Monitoring

```javascript
// Metrics collection
class MetricsCollector {
  static recordWebhookProcessed(eventType, success) {
    // Record metrics
  }
  
  static recordBuildValidation(duration, success) {
    // Record metrics
  }
  
  static recordPRCreated(repository, fixesApplied) {
    // Record metrics
  }
}
```

## Best Practices

### 1. Error Handling

```javascript
// Comprehensive error handling
class DependafixService {
  async processDependencyUpdate(options) {
    try {
      const result = await this.orchestrator.processAllUseCases(options);
      return { success: true, ...result };
    } catch (error) {
      this.context.log.error('Dependency update failed', { error, options });
      return {
        success: false,
        error: error.message,
        processingId: options.processingId
      };
    }
  }
}
```

### 2. Configuration Management

```javascript
// Centralized configuration
class Config {
  static get() {
    return {
      github: {
        token: process.env.GITHUB_TOKEN,
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET
      },
      byam: {
        endpoint: process.env.BYAM_ENDPOINT,
        apiKey: process.env.BYAM_API_KEY,
        timeout: parseInt(process.env.BYAM_TIMEOUT) || 30000
      },
      buildValidator: {
        timeout: parseInt(process.env.BUILD_TIMEOUT) || 300000,
        maxRetries: parseInt(process.env.BUILD_MAX_RETRIES) || 3
      }
    };
  }
}
```

### 3. Logging

```javascript
// Structured logging
class Logger {
  static info(message, metadata = {}) {
    console.log(JSON.stringify({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      ...metadata
    }));
  }
  
  static error(message, error, metadata = {}) {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...metadata
    }));
  }
}
```

## Contributing Guidelines

1. **Follow the established patterns**
2. **Write comprehensive tests**
3. **Document your changes**
4. **Use meaningful commit messages**
5. **Update relevant documentation**

### Pull Request Checklist

- [ ] Tests pass (`npm test`)
- [ ] Code quality checks pass (`npm run validate`)
- [ ] Documentation updated
- [ ] Integration tests added for new features
- [ ] Performance impact considered
- [ ] Error handling implemented
- [ ] Logging added for debugging

---

This development guide should be updated as the project evolves. For questions or clarifications, please refer to the main README or create an issue. 