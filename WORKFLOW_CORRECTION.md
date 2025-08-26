# 🔄 Corrected Dependafix Workflow

## **📋 Workflow Clarification**

### **Dependafix's Role:**
1. **Listen for GitHub webhook events** (push, pull_request, manual trigger)
2. **Detect Java projects** (Maven/Gradle)
3. **Execute builds** and capture build logs
4. **Extract failure details** and identify affected code
5. **Generate API diffs** from recent commits
6. **Extract dependency information** with security analysis
7. **Prepare data for Byam** (not generate JSON payload)

### **Byam's Role:**
1. **Receive data from Dependafix**
2. **Generate JSON payload** with context (code snippets, API diffs, dependency versions, error messages)
3. **Execute repair process** using LLM
4. **Validate fixes** by rebuilding
5. **Return results** to Dependafix

## **🔄 Correct Workflow Flow:**

```
GitHub Event → Dependafix → Extract Data → Send to Byam → Byam Generates JSON → LLM Analysis → Fix Generation → Return to Dependafix
```

## **📊 Data Structure Sent to Byam:**

```javascript
{
  repository: {
    fullName: "owner/repo",
    owner: "owner",
    name: "repo",
    url: "https://github.com/owner/repo"
  },
  
  buildInfo: {
    tool: "maven|gradle",
    success: false,
    logs: "build logs...",
    buildTime: 324,
    javaVersion: "11.0.2"
  },
  
  failures: [
    {
      id: "failure_123",
      type: "dependency_breaking_change",
      message: "Target version 15.0 not found in Maven Central",
      file: "pom.xml",
      line: 0,
      confidence: 95,
      severity: "high",
      dependencyInfo: {
        groupId: "com.google.guava",
        artifactId: "guava",
        version: "15.0"
      }
    }
  ],
  
  affectedCode: [
    {
      filePath: "src/main/java/com/example/DependencyTest.java",
      errorCount: 3,
      content: "file content...",
      affectedLines: [...]
    }
  ],
  
  apiDiffs: [
    {
      commitSha: "abc123",
      filePath: "src/main/java/com/example/Test.java",
      apiChanges: [...]
    }
  ],
  
  dependencyInfo: {
    dependencies: [
      {
        groupId: "com.google.guava",
        artifactId: "guava",
        version: "15.0",
        coordinates: "com.google.guava:guava:15.0"
      }
    ],
    securityVulnerabilities: [
      {
        dependency: {...},
        cveId: "CVE-2024-22236",
        severity: "high",
        description: "..."
      }
    ]
  },
  
  summary: {
    totalFailures: 151,
    totalAffectedFiles: 8,
    failureTypes: {...},
    severityDistribution: {...},
    confidenceScores: {...}
  }
}
```

## **🎯 Key Points:**

### **Dependafix Provides:**
- ✅ **Dependency Information** (versions, vulnerabilities, changes)
- ✅ **Failure Details** (compilation errors, build failures)
- ✅ **Affected Code** (file content, line numbers)
- ✅ **API Diffs** (recent changes, method signatures)
- ✅ **Build Context** (logs, tool, version)

### **Byam Generates:**
- ✅ **JSON Payload** with comprehensive context
- ✅ **LLM Prompts** for fix generation
- ✅ **Fix Suggestions** based on analysis
- ✅ **Validation Results** from rebuilds

## **🚀 Current MVP Status:**

### **✅ Completed:**
- Dependency information extraction
- Failure details identification
- Affected code analysis
- API diff generation
- Build execution and log capture
- Data preparation for Byam

### **🔄 Next Phase:**
- Send data to Byam API
- Receive JSON payload from Byam
- Process fix suggestions
- Create pull requests with fixes

## **📈 Benefits of This Approach:**

1. **Separation of Concerns**: Dependafix focuses on detection, Byam on fix generation
2. **Modularity**: Each system has a clear responsibility
3. **Scalability**: Byam can handle complex LLM interactions independently
4. **Maintainability**: Changes to fix generation don't affect detection logic
5. **Reusability**: Byam can be used by other tools beyond Dependafix

---

**Note**: The current MVP successfully extracts all necessary dependency information and failure details. The next step is integrating with the Byam API to send this data and receive the generated JSON payload for fix generation.
