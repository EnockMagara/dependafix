#!/usr/bin/env node

/**
 * Test script for Java dependency checking
 * 
 * This script demonstrates how to use the JavaDependencyChecker service
 * to check for outdated dependencies in a Java project.
 */

import { JavaDependencyChecker } from './src/services/java-dependency-checker.js';
import path from 'path';
import fs from 'fs/promises';

// Mock context for testing
const mockContext = {
  log: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.log(`[WARN] ${msg}`),
    error: (msg) => console.log(`[ERROR] ${msg}`),
    debug: (msg) => console.log(`[DEBUG] ${msg}`)
  }
};

/**
 * Test dependency checking on a local Java project
 */
async function testJavaDependencyCheck() {
  console.log('🔍 Testing Java Dependency Checker\n');
  
  // Check if bacardi-main directory exists
  const testRepoPath = './bacardi-main';
  
  try {
    await fs.access(testRepoPath);
    console.log(`✅ Found test repository: ${testRepoPath}`);
  } catch (error) {
    console.log(`❌ Test repository not found: ${testRepoPath}`);
    console.log('Please ensure the bacardi-main directory exists in the current directory.');
    return;
  }
  
  try {
    // Initialize the dependency checker
    const checker = new JavaDependencyChecker(mockContext);
    
    console.log('🚀 Starting dependency check...\n');
    
    // Check for outdated dependencies
    const result = await checker.checkOutdatedDependencies(testRepoPath);
    
    console.log('\n📊 Results:');
    console.log('===========');
    
    if (result.success) {
      console.log(`✅ Build Tool: ${result.buildTool}`);
      console.log(`📦 Outdated Dependencies: ${result.outdatedDependencies.length}`);
      
      if (result.outdatedDependencies.length > 0) {
        console.log('\n📋 Outdated Dependencies:');
        console.log('========================');
        
        result.outdatedDependencies.forEach((dep, index) => {
          console.log(`${index + 1}. ${dep.groupId}:${dep.artifactId}`);
          console.log(`   Current: ${dep.currentVersion} → Latest: ${dep.latestVersion}`);
          console.log(`   Scope: ${dep.scope}\n`);
        });
      } else {
        console.log('\n✅ All dependencies are up to date!');
      }
      
      // Show update commands
      console.log('\n🛠️ Update Commands:');
      console.log('==================');
      const commands = checker.getUpdateCommands(result.buildTool);
      
      for (const [name, command] of Object.entries(commands)) {
        console.log(`${name}: ${command}`);
      }
      
    } else {
      console.log(`❌ Check failed: ${result.error}`);
    }
    
  } catch (error) {
    console.error(`💥 Error during dependency check: ${error.message}`);
    console.error(error.stack);
  }
}

/**
 * Test build tool detection
 */
async function testBuildToolDetection() {
  console.log('\n🔧 Testing Build Tool Detection\n');
  
  const testRepoPath = './bacardi-main';
  
  try {
    const checker = new JavaDependencyChecker(mockContext);
    const buildTool = await checker.detectBuildTool(testRepoPath);
    
    console.log(`Detected build tool: ${buildTool || 'None'}`);
    
    if (buildTool) {
      console.log(`✅ ${buildTool.toUpperCase()} project detected`);
    } else {
      console.log('❌ No supported build tool detected');
    }
    
  } catch (error) {
    console.error(`💥 Error detecting build tool: ${error.message}`);
  }
}

/**
 * Test Maven dependency parsing
 */
async function testMavenDependencyParsing() {
  console.log('\n📋 Testing Maven Dependency Parsing\n');
  
  const testRepoPath = './bacardi-main';
  
  try {
    const checker = new JavaDependencyChecker(mockContext);
    const dependencies = await checker.parsePomXmlDependencies(testRepoPath);
    
    console.log(`Found ${dependencies.length} dependencies in pom.xml:`);
    
    dependencies.forEach((dep, index) => {
      console.log(`${index + 1}. ${dep.groupId}:${dep.artifactId}@${dep.currentVersion}`);
    });
    
  } catch (error) {
    console.error(`💥 Error parsing Maven dependencies: ${error.message}`);
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('🧪 Java Dependency Checker Test Suite\n');
  console.log('=====================================\n');
  
  // Test build tool detection
  await testBuildToolDetection();
  
  // Test Maven dependency parsing
  await testMavenDependencyParsing();
  
  // Test full dependency check
  await testJavaDependencyCheck();
  
  console.log('\n✅ Test suite completed!');
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
} 