import express from 'express';
import { Webhooks, createNodeMiddleware } from '@octokit/webhooks';
import { Octokit } from '@octokit/core';
import { createAppAuth } from '@octokit/auth-app';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize GitHub App with logging
const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET,
  log: console, // Enable verbose logging for debugging
});

// Webhook handlers
webhooks.onAny(async ({ name, payload }) => {
  console.log(`🔔 Received webhook event: ${name}`);
  console.log(`📁 Repository: ${payload.repository?.full_name || 'unknown'}`);
});

webhooks.on('push', async ({ payload }) => {
  try {
    console.log(`🚀 Processing push event...`);
    const { repository, commits } = payload;
    const repoOwner = repository.owner.login;
    const repoName = repository.name;
    const defaultBranch = repository.default_branch;

    console.log(`📋 Checking commits for package.json changes...`);
    const packageJsonChanged = commits.some(commit =>
      commit.modified.includes('package.json') || commit.added.includes('package.json')
    );

    if (!packageJsonChanged) {
      console.log(`❌ No package.json changes detected in ${repoOwner}/${repoName}`);
      return;
    }

    console.log(`✅ Detected package.json change in ${repoOwner}/${repoName}`);

    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: process.env.GITHUB_APP_ID,
        privateKey: await fs.readFile(process.env.GITHUB_PRIVATE_KEY_PATH, 'utf8'),
      },
    });

    console.log(`🔑 Getting installation ID...`);
    const installation = await octokit.request('GET /repos/{owner}/{repo}/installation', {
      owner: repoOwner,
      repo: repoName,
    });
    const installationId = installation.data.id;
    console.log(`🔑 Installation ID: ${installationId}`);

    const installationOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: process.env.GITHUB_APP_ID,
        privateKey: await fs.readFile(process.env.GITHUB_PRIVATE_KEY_PATH, 'utf8'),
        installationId,
      },
    });

    const fixContent = '// Placeholder fix for dependency update\nconsole.log("Fixed dependency issue");';
    const branchName = `fix-dependency-${Date.now()}`;
    console.log(`🌿 Creating branch: ${branchName}`);

    const refResponse = await installationOctokit.request('GET /repos/{owner}/{repo}/git/ref/heads/{branch}', {
      owner: repoOwner,
      repo: repoName,
      branch: defaultBranch,
    });
    const mainSha = refResponse.data.object.sha;
    console.log(`📍 Base SHA: ${mainSha}`);

    await installationOctokit.request('POST /repos/{owner}/{repo}/git/refs', {
      owner: repoOwner,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: mainSha,
    });
    console.log(`✅ Branch created successfully`);

    console.log(`📝 Creating commit...`);
    await installationOctokit.request('PUT /repos/{owner}/{repo}/contents/fix.js', {
      owner: repoOwner,
      repo: repoName,
      path: 'fix.js',
      message: 'Apply fix for dependency update',
      content: Buffer.from(fixContent).toString('base64'),
      branch: branchName,
    });
    console.log(`✅ Commit created successfully`);

    console.log(`🔀 Creating pull request...`);
    const pr = await installationOctokit.request('POST /repos/{owner}/{repo}/pulls', {
      owner: repoOwner,
      repo: repoName,
      title: 'Automated fix for dependency update',
      head: branchName,
      base: defaultBranch,
      body: 'This PR contains an automated fix for a breaking change detected in a dependency update.',
    });

    console.log(`🎉 Created PR #${pr.data.number} for ${repoOwner}/${repoName}`);
    console.log(`🔗 PR URL: ${pr.data.html_url}`);
  } catch (error) {
    console.error('❌ Error processing webhook:', error.message);
    console.error('📋 Error details:', error);
  }
});

// Middleware setup
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

// Use webhook middleware directly
app.use(createNodeMiddleware(webhooks, { path: '/webhook' }));

// Test route
app.get('/', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// Test webhook endpoint
app.post('/test-webhook', (req, res) => {
  console.log('Test webhook received:', req.body);
  res.json({ status: 'Test webhook received successfully' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});