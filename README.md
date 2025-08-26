# Dependafix - Refined Workflow

A GitHub App that automatically detects and analyzes pom.xml changes in pull requests, identifies compilation errors, and provides comprehensive dependency analysis.

## Overview

Dependafix focuses on pull request events to detect pom.xml changes and their impact on compilation. When compilation errors are detected after pom.xml changes, the system performs detailed analysis to identify dependency-related issues.

## Features

- **Pull Request Focus**: Analyzes pom.xml changes in pull requests
- **Compilation Error Detection**: Identifies errors after dependency changes
- **Repository Checkout**: Clones and analyzes repositories when needed
- **Comprehensive Error Handling**: Robust error recovery and fallback strategies
- **Edge Case Management**: Handles large repositories, network issues, and API limits

## Workflow

1. **Event Trigger**: Responds to pull request events (`opened`, `synchronize`, `reopened`)
2. **Java Project Detection**: Verifies the repository is a Java project
3. **pom.xml Change Detection**: Analyzes changes in pom.xml files
4. **Compilation Error Detection**: Identifies compilation errors after changes
5. **Repository Checkout**: Clones repository for detailed analysis (when needed)
6. **Comprehensive Analysis**: Performs dependency and build analysis
7. **Impact Assessment**: Correlates pom.xml changes with compilation errors

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd sample_bot
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# GitHub App configuration
GITHUB_APP_ID=your_app_id
GITHUB_PRIVATE_KEY=your_private_key

# Build configuration
MAVEN_OPTS=-Xmx2g -XX:MaxPermSize=512m
GRADLE_OPTS=-Xmx2g

# Timeout settings
CLONE_TIMEOUT=60000
BUILD_TIMEOUT=300000
API_TIMEOUT=30000
```

4. Start the application:
```bash
npm start
```

## Development

### Running Tests
```bash
node test-workflow.js
```

### Manual Trigger
Use the `/dependafix` command in issue comments to manually trigger analysis.

## Architecture

### Core Services

- **`PomXmlChangeDetector`**: Analyzes pom.xml changes in pull requests
- **`RepositoryChecker`**: Handles repository checkout and local analysis
- **`ErrorHandler`**: Comprehensive error handling and recovery
- **`WorkflowOrchestrator`**: Coordinates the entire workflow

### Event Handlers

- **`pull-request-handler.js`**: Handles pull request events
- **`manual-trigger-handler.js`**: Handles manual triggers via comments

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_APP_ID` | GitHub App ID | Required |
| `GITHUB_PRIVATE_KEY` | GitHub App private key | Required |
| `MAVEN_OPTS` | Maven JVM options | `-Xmx2g -XX:MaxPermSize=512m` |
| `CLONE_TIMEOUT` | Git clone timeout (ms) | `60000` |
| `BUILD_TIMEOUT` | Build execution timeout (ms) | `300000` |
| `API_TIMEOUT` | API request timeout (ms) | `30000` |

### Service Configuration

```javascript
const config = {
  build: {
    maven: { timeout: 300000, memory: '2g' },
    gradle: { timeout: 300000, memory: '2g' }
  },
  git: { shallowClone: true, depth: 1, timeout: 60000 },
  api: { rateLimit: 1000, timeout: 30000, retries: 3 },
  errorHandling: { maxRetries: 3, retryDelay: 5000 }
};
```

## Error Handling

The system implements comprehensive error handling with the following strategies:

- **Retry**: Automatic retry with exponential backoff
- **Fallback**: Alternative approaches when primary fails
- **Graceful Degradation**: Reduced functionality mode
- **Abort**: Stop processing for critical errors

### Error Categories

- **Network errors**: Connectivity and timeout issues
- **API errors**: GitHub API rate limits and errors
- **Filesystem errors**: File and directory operations
- **Git errors**: Repository operations
- **Build errors**: Maven/Gradle build issues
- **Parsing errors**: XML/JSON parsing issues
- **Resource errors**: Memory and disk constraints

## Best Practices

### Resource Management
- Automatic cleanup of temporary directories
- Memory limits for large projects
- Timeout mechanisms for long operations

### Performance Optimization
- Shallow cloning for large repositories
- Caching of API responses
- Parallel processing where possible

### Security
- Input validation and sanitization
- Resource isolation
- Secure credential management

## Monitoring

### Logging
- Structured logging with consistent format
- Log levels: DEBUG, INFO, WARN, ERROR
- Context information for debugging

### Metrics
- Error rates by category
- Processing times for each step
- Success/failure rates by operation
- Resource usage monitoring

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC License

## Support

For issues and questions, please create an issue in the repository.
