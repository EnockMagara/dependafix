# Dependency Update Use Cases Documentation

## Overview

This document describes the comprehensive dependency update use cases implemented in the Dependafix system. These use cases handle the most common breaking changes that occur when updating Java dependencies, providing automated detection, analysis, and fix generation.

## Supported Use Cases

### 1. Deprecated Method Replacement

**Description**: Automatically detects and replaces deprecated methods after library updates.

**Scenario**: After updating Apache Commons library, `getInstance()` method is deprecated and needs to be replaced with `getInstance2()`.

**System Actions**:
- Detects deprecation warnings in build logs
- Analyzes the deprecated method usage context
- Sends context to Byam LLM for intelligent replacement suggestions
- Generates code fixes with proper method replacements
- Validates fixes through rebuild process

**Example**:
```java
// Before (deprecated)
OldUtil.getInstance().processData(data);

// After (fixed)
OldUtil.getInstance2().processData(data);
```

**Handler**: `DeprecatedMethodHandler`

**Key Features**:
- Pattern-based fallback for common deprecations
- Context-aware replacement suggestions
- Import management for new method signatures
- Confidence scoring for generated fixes

---

### 2. API Signature Changes

**Description**: Adapts to changed API signatures in dependency updates.

**Scenario**: After a Spring Boot update, `processData(String)` now requires `processData(String, int)`.

**System Actions**:
- Detects method signature mismatch errors
- Analyzes required vs. found signatures
- Generates appropriate parameter additions or modifications
- Validates through compilation process

**Example**:
```java
// Before (old signature)
service.processData("test");

// After (new signature)
service.processData("test", 1);
```

**Handler**: `ApiSignatureHandler`

**Key Features**:
- Signature pattern matching
- Default parameter inference
- Type compatibility checking
- Multi-parameter adaptation

---

### 3. Dependency Scope Resolution

**Description**: Resolves missing dependency scope issues after updates.

**Scenario**: A Maven project fails at runtime due to missing `<scope>provided</scope>` for servlet API.

**System Actions**:
- Detects ClassNotFoundException and NoClassDefFoundError
- Identifies the dependency providing the missing class
- Recommends appropriate scope (provided, test, compile, etc.)
- Updates pom.xml or build.gradle with correct scope

**Example**:
```xml
<!-- Before (missing scope) -->
<dependency>
    <groupId>javax.servlet</groupId>
    <artifactId>javax.servlet-api</artifactId>
    <version>4.0.1</version>
</dependency>

<!-- After (correct scope) -->
<dependency>
    <groupId>javax.servlet</groupId>
    <artifactId>javax.servlet-api</artifactId>
    <version>4.0.1</version>
    <scope>provided</scope>
</dependency>
```

**Handler**: `DependencyScopeHandler`

**Key Features**:
- Class-to-dependency mapping
- Scope recommendation based on usage patterns
- Build tool agnostic (Maven/Gradle)
- Runtime vs. compile-time scope analysis

---

### 4. Removed Class Replacement

**Description**: Handles classes that were removed in dependency updates.

**Scenario**: A Gradle project fails because `OldUtil` class was removed, needs refactoring to use `NewUtil.getData()`.

**System Actions**:
- Detects "cannot find symbol" errors for classes
- Searches for replacement classes or methods
- Generates refactored code using compatible alternatives
- Updates imports and removes obsolete references

**Example**:
```java
// Before (removed class)
import com.example.OldUtil;
...
OldUtil.getData();

// After (replacement)
import com.example.NewUtil;
...
NewUtil.getData();
```

**Handler**: `RemovedClassesHandler`

**Key Features**:
- Class replacement pattern matching
- Method alternative suggestions
- Import cleanup and addition
- Superclass method fallback

---

### 5. Multi-File Synchronization

**Description**: Coordinates fixes across multiple files for complex dependency changes.

**Scenario**: Hibernate update affects Service.java and Dao.java, requiring synchronized method signature updates.

**System Actions**:
- Detects cross-file dependency issues
- Groups related files by dependency relationships
- Generates coordinated fixes across all affected files
- Ensures interface contracts are maintained

**Example**:
```java
// UserService.java - Before
public User getUser(Long id) {
    return userDao.findById(id);
}

// UserDao.java - Before
public User findById(Long id) {
    return session.get(User.class, id);
}

// After coordinated fix
// UserService.java
public User getUser(Long id) {
    return userDao.findById(id);
}

// UserDao.java
public User findById(Long id) {
    return entityManager.find(User.class, id);
}
```

**Handler**: `MultiFileChangesHandler`

**Key Features**:
- Cross-file dependency analysis
- Relationship type detection (service-dao, interface-implementation)
- Coordinated fix generation
- Import synchronization across files

---

## Use Case Orchestrator

The `UseCaseOrchestrator` coordinates all use cases and provides a unified interface for dependency update fixes.

### Orchestration Process

1. **Detection Phase**: Runs all handlers to detect issues
2. **Fix Generation**: Generates coordinated fixes using Byam LLM
3. **Application Phase**: Applies fixes in optimal order
4. **Validation Phase**: Validates through comprehensive build
5. **PR Creation**: Creates pull request with all fixes

### Optimal Fix Application Order

1. **Dependency Scope** - Fix build dependencies first
2. **Removed Classes** - Replace removed classes
3. **Deprecated Methods** - Fix deprecated method calls
4. **API Signatures** - Adapt method signatures
5. **Multi-File Changes** - Coordinate cross-file updates

## Integration with Byam LLM

All use cases integrate with the Byam LLM system for intelligent fix generation:

### LLM Integration Features

- **Context-aware analysis**: Provides full source code context
- **Library-specific knowledge**: Includes version change information
- **Pattern recognition**: Learns from common migration patterns
- **Confidence scoring**: Provides reliability metrics for fixes
- **Fallback mechanisms**: Pattern-based fixes when LLM unavailable

### Byam Request Structure

```javascript
{
  type: 'use_case_type',
  library: 'library-name',
  oldVersion: '1.0.0',
  newVersion: '2.0.0',
  sourceCode: 'surrounding context',
  targetLine: 'line to fix',
  imports: ['current imports'],
  buildLogContext: 'error context'
}
```

## Testing

### Test Coverage

The system includes comprehensive testing for all use cases:

- **Individual Use Case Tests**: Test each handler independently
- **Orchestration Tests**: Test coordinated fix application
- **Integration Tests**: Test with real build scenarios
- **PR Creation Tests**: Test pull request generation

### Running Tests

```bash
# Run comprehensive use case tests
node test-use-cases.js

# Run specific Java dependency tests
node test-java-dependencies.js
```

## Configuration

### Use Case Configuration

```javascript
{
  useCases: {
    deprecatedMethod: { enabled: true, confidence: 0.8 },
    apiSignature: { enabled: true, confidence: 0.7 },
    dependencyScope: { enabled: true, confidence: 0.9 },
    removedClasses: { enabled: true, confidence: 0.6 },
    multiFileChanges: { enabled: true, confidence: 0.8 }
  },
  byam: {
    enabled: true,
    endpoint: 'http://localhost:3001',
    timeout: 30000
  }
}
```

## Error Handling

### Graceful Degradation

- **LLM Unavailable**: Falls back to pattern-based fixes
- **Build Failures**: Continues with partial fixes
- **File Access Issues**: Skips problematic files
- **Timeout Handling**: Applies time limits to all operations

### Validation

- **Build Validation**: Ensures fixes don't break compilation
- **Test Validation**: Runs tests to verify functionality
- **Incremental Fixes**: Applies fixes one at a time for isolation

## Monitoring and Logging

### Comprehensive Logging

- **Issue Detection**: Logs all detected issues with context
- **Fix Generation**: Tracks fix generation success/failure
- **Application Results**: Records fix application outcomes
- **Validation Results**: Logs build and test results

### Metrics

- **Success Rates**: Tracks fix success rates by use case
- **Confidence Scores**: Monitors LLM confidence levels
- **Build Times**: Measures validation performance
- **Coverage**: Tracks issue detection coverage

## Future Enhancements

### Planned Features

1. **Machine Learning**: Improve pattern recognition over time
2. **Custom Patterns**: Allow project-specific fix patterns
3. **Preview Mode**: Show fixes before applying
4. **Rollback**: Ability to revert applied fixes
5. **Batch Processing**: Handle multiple dependency updates

### Extension Points

- **Custom Handlers**: Add project-specific use case handlers
- **Pattern Libraries**: Extend pattern matching capabilities
- **Integration Hooks**: Add custom validation steps
- **Notification Systems**: Integrate with team communication tools

## Troubleshooting

### Common Issues

1. **Build Tool Detection**: Ensure pom.xml or build.gradle exists
2. **Source File Access**: Check file permissions and paths
3. **LLM Connectivity**: Verify Byam service availability
4. **Memory Usage**: Monitor for large file processing

### Debug Mode

Enable debug logging for detailed troubleshooting:

```javascript
const config = {
  debug: true,
  logLevel: 'verbose'
};
```

## Performance Considerations

### Optimization Strategies

- **Parallel Processing**: Run detections in parallel
- **Caching**: Cache file reads and analysis results
- **Incremental Updates**: Only process changed files
- **Resource Limits**: Set timeouts and memory limits

### Scalability

- **Large Codebases**: Handle projects with thousands of files
- **Multiple Dependencies**: Process multiple updates simultaneously
- **Concurrent Builds**: Support parallel build validation
- **Resource Management**: Efficient memory and CPU usage

---

*This documentation covers the comprehensive dependency update use case system. For implementation details, see the individual handler files in `src/services/use-cases/`.* 