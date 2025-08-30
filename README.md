# Dependafix - Enhanced GitHub App

A production-ready GitHub App that automatically detects and analyzes pom.xml changes in pull requests, identifies compilation errors using a dual-strategy approach, and provides comprehensive dependency analysis.

## 🚀 Overview

Dependafix uses an enhanced dual-strategy approach to detect compilation errors:
1. **CI/CD Analysis**: Checks existing CI/CD pipeline outputs for compilation errors
2. **Automated Build**: Falls back to automated repository checkout and build execution when CI/CD is unavailable

## ✨ Features

- **Dual-Strategy Error Detection**: CI/CD logs + automated builds
- **Comprehensive Error Parsing**: Maven, Gradle, and direct Java compilation errors
- **Pull Request Analysis**: Analyzes pom.xml changes and their impact
- **Manual Trigger Support**: `/dependafix` command for on-demand analysis
- **Enhanced Reporting**: Detailed error breakdown by type and severity
- **Production Ready**: Robust error handling and infinite loop prevention

## 🔄 Enhanced Workflow

1. **Event Trigger**: Responds to pull request events and manual commands
2. **Project Detection**: Identifies Java projects (Maven/Gradle)
3. **Build Strategy Selection**: 
   - **Strategy 1**: Check CI/CD pipeline outputs
   - **Strategy 2**: Automated repository checkout and build
4. **Multi-Stage Error Detection**:
   - Maven/Gradle build errors
   - Direct Java compilation errors
   - Dependency resolution issues
5. **Enhanced Analysis**: Comprehensive error categorization and reporting
6. **Smart Reporting**: Detailed breakdown by error type with file locations

## 🛠️ Installation

1. **Clone the repository**:
```bash
git clone <repository-url>
cd sample_bot
```

2. **Install dependencies**:
```bash
npm install
```

3. **Configure environment variables**:
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

4. **Start the application**:
```bash
npm start
```

## 🎯 Usage

### Automatic Analysis
The app automatically analyzes pull requests when:
- Pull request is opened
- Pull request is updated (synchronize)
- Pull request is reopened

### Manual Analysis
Use the `/dependafix` command in any issue comment to trigger analysis:
```
/dependafix
```

## 🏗️ Architecture

### Enhanced Services

- **`EnhancedBuildExecutor`**: Dual-strategy build execution (CI/CD + automated)
- **`EnhancedWorkflowOrchestrator`**: Coordinates enhanced workflow
- **`PomXmlChangeDetector`**: Analyzes pom.xml changes
- **`RepositoryChecker`**: Handles repository operations
- **`ContextExtractor`**: Extracts comprehensive context
- **`ErrorHandler`**: Robust error handling and recovery

### Event Handlers

- **`enhanced-pull-request-handler.js`**: Enhanced pull request analysis
- **`enhanced-manual-trigger-handler.js`**: Manual trigger with loop prevention

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_APP_ID` | GitHub App ID | Required |
| `GITHUB_PRIVATE_KEY` | GitHub App private key | Required |
| `MAVEN_OPTS` | Maven JVM options | `-Xmx2g -XX:MaxPermSize=512m` |
| `CLONE_TIMEOUT` | Git clone timeout (ms) | `60000` |
| `BUILD_TIMEOUT` | Build execution timeout (ms) | `300000` |
| `API_TIMEOUT` | API request timeout (ms) | `30000` |

### Build Strategy Configuration

```javascript
const buildConfig = {
  ci_cd: {
    enabled: true,
    timeout: 30000,
    maxLogSize: 1024 * 1024 // 1MB
  },
  automated_build: {
    enabled: true,
    timeout: 300000,
    memory: '2g',
    cleanup: true
  }
};
```

## 📊 Enhanced Error Detection

### Error Types Detected

1. **Dependency Warnings**: Missing POM files, version conflicts
2. **Dependency Errors**: Unresolvable dependencies, network issues
3. **Compilation Errors**: Java syntax errors, missing imports
4. **Build Errors**: Maven/Gradle configuration issues

### Error Reporting

The enhanced system provides detailed error reports including:
- **Error categorization** by type
- **File locations** with line numbers
- **Dependency information** (groupId:artifactId:version)
- **Confidence scores** for error detection
- **Build strategy** used (CI/CD vs automated)

## 🔒 Production Features

### Infinite Loop Prevention
- Bot user detection
- Report content filtering
- Comment length validation

### Resource Management
- Automatic temporary directory cleanup
- Memory limits for large projects
- Timeout mechanisms for all operations

### Error Handling
- Comprehensive retry logic
- Graceful degradation
- Detailed error logging

## 📈 Monitoring

### Logging
- Structured logging with request IDs
- Log levels: DEBUG, INFO, WARN, ERROR
- Performance metrics and timing

### Metrics
- Build strategy success rates
- Error detection accuracy
- Processing times by operation
- Resource usage monitoring

## 🚀 Deployment

### Production Checklist
- [ ] Environment variables configured
- [ ] GitHub App permissions set
- [ ] Webhook endpoints configured
- [ ] Monitoring and logging enabled
- [ ] Error handling tested
- [ ] Performance benchmarks established

### Scaling Considerations
- Horizontal scaling with multiple instances
- Database for persistent storage (if needed)
- Load balancing for webhook endpoints
- Caching for API responses

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

ISC License

## 🆘 Support

For issues and questions, please create an issue in the repository.

## 🔄 Version History

### v2.0.0 (Production)
- Enhanced dual-strategy error detection
- Comprehensive error parsing and categorization
- Production-ready infinite loop prevention
- Enhanced reporting with detailed breakdowns
- Automated build execution with fallback strategies
