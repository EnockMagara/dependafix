import express from 'express';
import { Webhooks, createNodeMiddleware } from '@octokit/webhooks';
import { Octokit } from '@octokit/core';
import { createAppAuth } from '@octokit/auth-app';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize GitHub App
const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET,
});

const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: await fs.readFile(process.env.GITHUB_PRIVATE_KEY_PATH, 'utf8'),
  },
});

// Middleware to handle JSON payloads - MUST BE FIRST
app.use(express.json());

// Add debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

// Add a simple test route
app.get('/', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// Add a test webhook endpoint without signature verification
app.post('/test-webhook', (req, res) => {
  console.log('Test webhook received:', req.body);
  res.json({ status: 'Test webhook received successfully' });
});

// Webhook middleware
app.use(createNodeMiddleware(webhooks, { path: '/webhook' }));

// Add webhook debugging
webhooks.onAny(async ({ name, payload }) => {
  console.log(`Received webhook event: ${name}`);
  console.log(`Repository: ${payload.repository?.full_name || 'unknown'}`);
});

// Webhook event handler for push events
webhooks.on('push', async ({ payload }) => {
  const { repository, commits } = payload;
  const repoOwner = repository.owner.login;
  const repoName = repository.name;

  // Check if package.json was modified
  const packageJsonChanged = commits.some(commit =>
    commit.modified.includes('package.json') || commit.added.includes('package.json')
  );

  if (!packageJsonChanged) return;

  console.log(`Detected package.json change in ${repoOwner}/${repoName}`);

  // Get installation ID for the repository
  const installation = await octokit.request('GET /repos/{owner}/{repo}/installation', {
    owner: repoOwner,
    repo: repoName,
  });
  const installationId = installation.data.id;

  // Authenticate as the GitHub App installation
  const installationOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID,
      privateKey: await fs.readFile(process.env.GITHUB_PRIVATE_KEY_PATH, 'utf8'),
      installationId,
    },
  });

  // Placeholder: Simulate detecting a breaking change and generating a fix
  const fixContent = '// Placeholder fix for dependency update\nconsole.log("Fixed dependency issue");';
  const branchName = `fix-dependency-${Date.now()}`;

  // Create a new branch
  const refResponse = await installationOctokit.request('GET /repos/{owner}/{repo}/git/ref/heads/main', {
    owner: repoOwner,
    repo: repoName,
  });
  const mainSha = refResponse.data.object.sha;

  await installationOctokit.request('POST /repos/{owner}/{repo}/git/refs', {
    owner: repoOwner,
    repo: repoName,
    ref: `refs/heads/${branchName}`,
    sha: mainSha,
  });

  // Commit the fix
  await installationOctokit.request('PUT /repos/{owner}/{repo}/contents/fix.js', {
    owner: repoOwner,
    repo: repoName,
    path: 'fix.js',
    message: 'Apply fix for dependency update',
    content: Buffer.from(fixContent).toString('base64'),
    branch: branchName,
  });

  // Create a PR
  await installationOctokit.request('POST /repos/{owner}/{repo}/pulls', {
    owner: repoOwner,
    repo: repoName,
    title: 'Automated fix for dependency update',
    head: branchName,
    base: 'main',
    body: 'This PR contains an automated fix for a breaking change detected in a dependency update.',
  });

  console.log(`Created PR for ${repoOwner}/${repoName}`);
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});