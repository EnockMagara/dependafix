# Dependafix Bot

🤖 **Automated Dependency Update Fix System** with comprehensive build validation and intelligent code fixes.

## Overview

Dependafix is an advanced GitHub bot that automatically detects and fixes issues caused by dependency updates. It uses sophisticated pattern recognition, LLM-powered code generation, and comprehensive build validation to ensure that dependency updates don't break your codebase.

### Key Features

- **🔍 Intelligent Issue Detection**: Identifies 5 types of dependency-related issues
- **🤖 AI-Powered Fixes**: Uses Byam LLM to generate context-aware code fixes
- **🔨 Build Validation**: Validates all fixes through comprehensive build testing
- **📊 Comprehensive Reporting**: Detailed validation reports and PR descriptions
- **🎯 Pattern-Based Fallbacks**: Robust fallback mechanisms when AI is unavailable
- **🔧 Multi-Build Tool Support**: Maven, Gradle, and more

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GitHub Bot    │────│  Dependafix     │────│  Build          │
│   (Webhooks)    │    │  Service        │    │  Validator      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
            ┌───────▼────────┐  ┌──────▼──────┐
            │ Use Case       │  │ Byam LLM    │
            │ Orchestrator   │  │ Service     │
            └────────────────┘  └─────────────┘
```

## Supported Use Cases

1. **Deprecated Method Replacement**: Automatically replaces deprecated methods with modern alternatives
2. **API Signature Changes**: Adapts method calls to new API signatures
3. **Dependency Scope Resolution**: Fixes missing or incorrect dependency scopes
4. **Removed Classes**: Refactors code to use replacement classes
5. **Multi-File Synchronization**: Coordinates changes across multiple related files

## Quick Start

### Prerequisites

- Node.js 18+
- Git
- Java 11+ (for Java projects)
- Maven or Gradle (for build tools)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/dependafix-bot.git
   cd dependafix-bot
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment**:
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Run initial setup**:
   ```bash
   npm run setup
   ```

### Development Setup

1. **Start the mock server** (for testing):
   ```bash
   npm run mock:server
   ```

2. **Run the application in development mode**:
   ```bash
   npm run dev
   ```

3. **Run tests**:
   ```bash
   npm test
   ```

## Testing Guide

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Test Categories

#### 1. Unit Tests
- **Location**: `test/unit/`
- **Purpose**: Test individual components in isolation
- **Mocking**: Extensive mocking of external dependencies

```bash
npm run test:unit
```

#### 2. Integration Tests
- **Location**: `test/integration/`
- **Purpose**: Test complete workflows with mocked external services
- **Coverage**: Webhook processing, build validation, use case orchestration

```bash
npm run test:integration
```

#### 3. Use Case Tests
- **Location**: `test-use-cases.js`
- **Purpose**: Test all 5 dependency update scenarios
- **Features**: Realistic dependency update simulations

```bash
npm run test:use-cases
```

#### 4. Build Validation Tests
- **Location**: `test-build-validation.js`
- **Purpose**: Test build validation with different outcomes
- **Scenarios**: Success, failure, partial success, timeout

```bash
npm run test:build-validation
```

### Mock Testing

The project includes comprehensive mocking for:

#### Mock Server (`test/mock/mock-server.js`)
- **GitHub API**: Repository, PR creation, file contents
- **Byam LLM**: Fix generation, health checks
- **Build Tools**: Maven/Gradle execution simulation
- **Test Data**: Realistic build logs and dependency information

```bash
# Start mock server
npm run mock:server

# Run webhook simulation
npm run test:mock-webhook
```

#### Webhook Simulator (`test/mock/webhook-simulator.js`)
- **Pull Request Events**: Dependency update PRs
- **Push Events**: Direct dependency changes
- **Issue Comments**: Manual dependency checks
- **Repository Events**: New repository setup

```bash
# Simulate specific webhook
node test/mock/webhook-simulator.js http://localhost:3000/webhook pr

# Run comprehensive simulation
npm run test:mock-webhook
```

### Testing Best Practices

1. **Use Descriptive Test Names**:
   ```javascript
   it('should block PR creation when build validation fails', async () => {
     // Test implementation
   });
   ```

2. **Mock External Dependencies**:
   ```javascript
   sinon.stub(buildValidator, 'runCleanBuild').resolves({
     success: false,
     logs: '[ERROR] BUILD FAILED'
   });
   ```

3. **Test Error Scenarios**:
   ```javascript
   it('should handle repository checkout failures gracefully', async () => {
     // Test error handling
   });
   ```

4. **Validate Build Integration**:
   ```javascript
   expect(result.buildValidated).to.be.true;
   expect(result.shouldCreatePR).to.be.true;
   ```

## Usage Examples

### 1. Basic Webhook Processing

```javascript
// Process a dependency update PR
const result = await dependafixService.processWebhookEvent('pull_request', {
  action: 'opened',
  pull_request: {
    title: 'Bump spring-core from 5.3.0 to 6.0.0',
    user: { login: 'dependabot[bot]' }
  },
  repository: {
    name: 'my-project',
    full_name: 'org/my-project'
  }
});

console.log(`Processing result: ${result.success}`);
console.log(`Build validated: ${result.buildValidated}`);
console.log(`Fixes applied: ${result.appliedFixes}`);
```

### 2. Manual Dependency Check

```javascript
// Trigger manual dependency analysis
const result = await dependafixService.processDependencyUpdate({
  repositoryUrl: 'https://github.com/org/my-project',
  branch: 'main',
  dependencyInfo: {
    name: 'hibernate-core',
    oldVersion: '5.6.0',
    newVersion: '6.2.0'
  }
});
```

### 3. Build Validation

```javascript
// Validate fixes before creating PR
const validationResult = await buildValidator.validateFixes(
  './my-project',
  'maven',
  { isCritical: true }
);

if (validationResult.shouldCreatePR) {
  // Create pull request
  await prCreator.createPullRequest(/* ... */);
}
```

## Configuration

### Environment Variables

Key configuration options (see `env.example` for complete list):

```bash
# GitHub Integration
GITHUB_TOKEN=your_github_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Byam LLM
BYAM_ENDPOINT=http://localhost:8080/api/byam
BYAM_API_KEY=your_api_key

# Build Configuration
BUILD_TIMEOUT=300000
BUILD_MAX_RETRIES=3

# Validation Thresholds
TEST_FAILURE_THRESHOLD=0.2
CRITICAL_TEST_FAILURE_THRESHOLD=0.05
```

### Service Configuration

```javascript
const dependafixService = new DependafixService(context, {
  byam: {
    endpoint: process.env.BYAM_ENDPOINT,
    apiKey: process.env.BYAM_API_KEY,
    timeout: 30000
  },
  buildValidator: {
    timeout: 300000,
    maxRetries: 3,
    testFailureThreshold: 0.2
  }
});
```

## Development Workflow

### 1. Local Development

```bash
# Start development environment
npm run dev

# Run tests in watch mode
npm run test:watch

# Check code quality
npm run lint
npm run format
```

### 2. Testing Changes

```bash
# Run comprehensive validation
npm run validate

# Test specific use case
npm run test:use-cases

# Test build validation
npm run test:build-validation
```

### 3. Mock Testing

```bash
# Start mock server
npm run mock:server

# In another terminal, simulate webhooks
npm run test:mock-webhook

# Or run complete demo
npm run demo
```

## Debugging

### Enable Debug Logging

```bash
export LOG_LEVEL=debug
npm run dev
```

### Mock Mode

```bash
export MOCK_MODE=true
npm run dev
```

### Test Specific Scenarios

```bash
# Test deprecated method scenario
node test/mock/webhook-simulator.js http://localhost:3000/webhook pr

# Test build validation failure
node test-build-validation.js
```

## Contributing

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm run validate`
5. Submit a pull request

### Code Quality

- **ESLint**: `npm run lint`
- **Prettier**: `npm run format`
- **Tests**: `npm test`
- **Coverage**: `npm run test:coverage`

### Testing Requirements

- Unit tests for all new components
- Integration tests for new workflows
- Mock external dependencies
- Maintain >90% test coverage

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/dependafix-bot/issues)
- **Documentation**: [Wiki](https://github.com/your-org/dependafix-bot/wiki)
- **Discord**: [Community Server](https://discord.gg/dependafix)

---

**Built with ❤️ by the Dependafix Team** 