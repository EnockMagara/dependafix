#!/usr/bin/env node

/**
 * Webhook Simulator for Dependafix Testing
 * 
 * Simulates GitHub webhook events to test the complete workflow:
 * - Pull request events
 * - Push events
 * - Issue comments
 * - Repository events
 */

import axios from 'axios';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);

class WebhookSimulator {
  constructor(targetUrl = 'http://localhost:3000', secret = 'test-secret') {
    this.targetUrl = targetUrl;
    this.secret = secret;
    this.deliveryId = 1;
  }

  /**
   * Generate GitHub webhook signature
   */
  generateSignature(payload) {
    const hmac = createHash('sha256').update(this.secret);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Send webhook event
   */
  async sendWebhook(event, payload) {
    const payloadString = JSON.stringify(payload);
    const signature = this.generateSignature(payloadString);
    
    const headers = {
      'Content-Type': 'application/json',
      'X-GitHub-Event': event,
      'X-GitHub-Delivery': `${this.deliveryId++}`,
      'X-Hub-Signature-256': signature,
      'User-Agent': 'GitHub-Hookshot/webhook-simulator'
    };

    try {
      console.log(`📡 Sending ${event} webhook to ${this.targetUrl}`);
      console.log(`📋 Payload: ${JSON.stringify(payload, null, 2)}`);
      
      const response = await axios.post(this.targetUrl, payload, { headers });
      
      console.log(`✅ Webhook sent successfully - Status: ${response.status}`);
      console.log(`📤 Response: ${JSON.stringify(response.data, null, 2)}`);
      
      return { success: true, response: response.data };
    } catch (error) {
      console.error(`❌ Webhook failed: ${error.message}`);
      if (error.response) {
        console.error(`📤 Error response: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Simulate pull request opened event
   */
  async simulatePullRequestOpened() {
    const payload = {
      action: 'opened',
      number: 123,
      pull_request: {
        id: 123456,
        number: 123,
        title: 'Bump spring-core from 5.3.0 to 6.0.0',
        body: 'Updates spring-core from 5.3.0 to 6.0.0\n\nThis is an automated dependency update.',
        state: 'open',
        head: {
          ref: 'dependabot/maven/spring-core-6.0.0',
          sha: 'abc123def456'
        },
        base: {
          ref: 'main',
          sha: 'def456abc123'
        },
        user: {
          login: 'dependabot[bot]',
          type: 'Bot'
        },
        html_url: 'https://github.com/example/test-repo/pull/123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      repository: {
        id: 12345,
        name: 'test-repo',
        full_name: 'example/test-repo',
        owner: {
          login: 'example',
          type: 'Organization'
        },
        clone_url: 'https://github.com/example/test-repo.git',
        default_branch: 'main',
        language: 'Java'
      },
      sender: {
        login: 'dependabot[bot]',
        type: 'Bot'
      }
    };

    return await this.sendWebhook('pull_request', payload);
  }

  /**
   * Simulate push event with dependency changes
   */
  async simulatePushWithDependencyChanges() {
    const payload = {
      ref: 'refs/heads/main',
      before: 'def456abc123',
      after: 'abc123def456',
      commits: [
        {
          id: 'abc123def456',
          message: 'Update dependencies to latest versions',
          author: {
            name: 'Developer',
            email: 'dev@example.com'
          },
          added: [],
          modified: ['pom.xml', 'src/main/java/com/example/Service.java'],
          removed: []
        }
      ],
      repository: {
        id: 12345,
        name: 'test-repo',
        full_name: 'example/test-repo',
        owner: {
          login: 'example',
          type: 'Organization'
        },
        clone_url: 'https://github.com/example/test-repo.git',
        default_branch: 'main',
        language: 'Java'
      },
      sender: {
        login: 'developer',
        type: 'User'
      }
    };

    return await this.sendWebhook('push', payload);
  }

  /**
   * Simulate issue comment for manual dependency check
   */
  async simulateIssueComment() {
    const payload = {
      action: 'created',
      issue: {
        id: 54321,
        number: 456,
        title: 'Manual dependency check request',
        body: 'Please check for outdated dependencies',
        state: 'open',
        user: {
          login: 'developer',
          type: 'User'
        }
      },
      comment: {
        id: 98765,
        body: '/check-dependencies',
        user: {
          login: 'developer',
          type: 'User'
        },
        created_at: new Date().toISOString()
      },
      repository: {
        id: 12345,
        name: 'test-repo',
        full_name: 'example/test-repo',
        owner: {
          login: 'example',
          type: 'Organization'
        },
        clone_url: 'https://github.com/example/test-repo.git',
        default_branch: 'main',
        language: 'Java'
      },
      sender: {
        login: 'developer',
        type: 'User'
      }
    };

    return await this.sendWebhook('issue_comment', payload);
  }

  /**
   * Simulate repository event
   */
  async simulateRepositoryEvent() {
    const payload = {
      action: 'created',
      repository: {
        id: 12345,
        name: 'new-test-repo',
        full_name: 'example/new-test-repo',
        owner: {
          login: 'example',
          type: 'Organization'
        },
        clone_url: 'https://github.com/example/new-test-repo.git',
        default_branch: 'main',
        language: 'Java',
        created_at: new Date().toISOString()
      },
      sender: {
        login: 'developer',
        type: 'User'
      }
    };

    return await this.sendWebhook('repository', payload);
  }

  /**
   * Run comprehensive webhook simulation
   */
  async runComprehensiveSimulation() {
    console.log('🚀 Starting Comprehensive Webhook Simulation');
    console.log('═'.repeat(60));

    const results = {
      pullRequest: null,
      push: null,
      issueComment: null,
      repository: null
    };

    // Test 1: Pull Request Opened
    console.log('\n📋 Test 1: Pull Request Opened (Dependency Update)');
    results.pullRequest = await this.simulatePullRequestOpened();
    await this.delay(2000);

    // Test 2: Push with Dependency Changes
    console.log('\n📋 Test 2: Push with Dependency Changes');
    results.push = await this.simulatePushWithDependencyChanges();
    await this.delay(2000);

    // Test 3: Issue Comment (Manual Check)
    console.log('\n📋 Test 3: Issue Comment (Manual Dependency Check)');
    results.issueComment = await this.simulateIssueComment();
    await this.delay(2000);

    // Test 4: Repository Event
    console.log('\n📋 Test 4: Repository Event');
    results.repository = await this.simulateRepositoryEvent();

    // Summary
    console.log('\n📊 Simulation Summary');
    console.log('═'.repeat(60));
    
    const successCount = Object.values(results).filter(r => r && r.success).length;
    const totalCount = Object.keys(results).length;
    
    console.log(`✅ Successful webhooks: ${successCount}/${totalCount}`);
    
    for (const [event, result] of Object.entries(results)) {
      const status = result && result.success ? '✅' : '❌';
      console.log(`  ${status} ${event}`);
    }

    return results;
  }

  /**
   * Delay utility
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetUrl = process.argv[2] || 'http://localhost:3000/webhook';
  const simulator = new WebhookSimulator(targetUrl);
  
  const command = process.argv[3] || 'all';
  
  switch (command) {
    case 'pr':
      simulator.simulatePullRequestOpened();
      break;
    case 'push':
      simulator.simulatePushWithDependencyChanges();
      break;
    case 'comment':
      simulator.simulateIssueComment();
      break;
    case 'repo':
      simulator.simulateRepositoryEvent();
      break;
    case 'all':
    default:
      simulator.runComprehensiveSimulation();
      break;
  }
}

export { WebhookSimulator }; 