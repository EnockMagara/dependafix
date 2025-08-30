# 🚀 Production Deployment Guide

## 📋 Pre-Deployment Checklist

### ✅ Environment Setup
- [ ] Node.js 18+ installed
- [ ] Git configured
- [ ] Environment variables prepared
- [ ] GitHub App created and configured

### ✅ GitHub App Configuration
- [ ] App ID and private key available
- [ ] Webhook URL configured
- [ ] Permissions set correctly
- [ ] App installed on target repositories

### ✅ Security Review
- [ ] Environment variables secured
- [ ] Private key properly stored
- [ ] Network access configured
- [ ] Firewall rules updated

## 🔧 Installation Steps

### 1. Repository Setup
```bash
# Clone the production repository
git clone <repository-url>
cd sample_bot

# Install dependencies
npm install --production

# Verify installation
npm list
```

### 2. Environment Configuration
```bash
# Create environment file
cp .env.example .env

# Configure required variables
GITHUB_APP_ID=your_app_id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"

# Optional: Configure build settings
MAVEN_OPTS=-Xmx2g -XX:MaxPermSize=512m
GRADLE_OPTS=-Xmx2g
CLONE_TIMEOUT=60000
BUILD_TIMEOUT=300000
API_TIMEOUT=30000
```

### 3. GitHub App Setup
```bash
# Verify GitHub App configuration
npm run verify-config

# Test webhook connectivity
npm run test-webhook
```

## 🏗️ Deployment Options

### Option 1: Direct Deployment
```bash
# Start the application
npm start

# Or use PM2 for production
npm install -g pm2
pm2 start src/index.js --name "dependafix"
pm2 save
pm2 startup
```

### Option 2: Docker Deployment
```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# Build and run
docker build -t dependafix .
docker run -d --name dependafix-app -p 3000:3000 --env-file .env dependafix
```

### Option 3: Cloud Deployment

#### Heroku
```bash
# Create Heroku app
heroku create your-dependafix-app

# Set environment variables
heroku config:set GITHUB_APP_ID=your_app_id
heroku config:set GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"

# Deploy
git push heroku main
```

#### AWS Lambda
```bash
# Package for Lambda
npm run build-lambda

# Deploy using AWS CLI
aws lambda create-function \
  --function-name dependafix \
  --runtime nodejs18.x \
  --handler src/index.handler \
  --zip-file fileb://dependafix.zip \
  --environment Variables="{GITHUB_APP_ID=your_app_id,GITHUB_PRIVATE_KEY=your_private_key}"
```

## 🔒 Security Configuration

### Environment Variables
```bash
# Required
GITHUB_APP_ID=your_app_id
GITHUB_PRIVATE_KEY=your_private_key

# Optional but recommended
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
```

### GitHub App Permissions
```json
{
  "permissions": {
    "contents": "read",
    "issues": "write",
    "pull_requests": "read",
    "actions": "read"
  },
  "events": [
    "pull_request",
    "issue_comment"
  ]
}
```

## 📊 Monitoring Setup

### Logging Configuration
```javascript
// Configure structured logging
const logger = {
  level: process.env.LOG_LEVEL || 'info',
  format: 'json',
  timestamp: true,
  requestId: true
};
```

### Health Checks
```bash
# Health check endpoint
curl http://localhost:3000/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2025-08-30T10:00:00.000Z",
  "version": "2.0.0"
}
```

### Metrics Collection
```bash
# Monitor application metrics
npm run metrics

# Check error rates
npm run error-report
```

## 🔄 Update Procedures

### Rolling Updates
```bash
# 1. Deploy new version
git pull origin main
npm install

# 2. Restart application
pm2 restart dependafix

# 3. Verify deployment
npm run health-check
```

### Zero-Downtime Deployment
```bash
# Using PM2 cluster mode
pm2 start src/index.js --name "dependafix" --instances max --exec-mode cluster

# Rolling restart
pm2 reload dependafix
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Webhook Failures
```bash
# Check webhook configuration
npm run verify-webhook

# Test webhook manually
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -d '{"zen":"test"}'
```

#### 2. Build Timeouts
```bash
# Increase timeout settings
export BUILD_TIMEOUT=600000  # 10 minutes
export CLONE_TIMEOUT=120000  # 2 minutes

# Restart application
pm2 restart dependafix
```

#### 3. Memory Issues
```bash
# Monitor memory usage
pm2 monit

# Increase memory limits
export MAVEN_OPTS="-Xmx4g -XX:MaxPermSize=1g"
export GRADLE_OPTS="-Xmx4g"
```

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug
export NODE_ENV=development

# Start with debug output
npm run dev
```

## 📈 Performance Optimization

### Resource Limits
```bash
# Set appropriate limits
export MAX_CONCURRENT_BUILDS=5
export MAX_REPO_SIZE_MB=500
export MAX_BUILD_TIME_MS=300000
```

### Caching Strategy
```javascript
// Enable caching for API responses
const cacheConfig = {
  enabled: true,
  ttl: 300000, // 5 minutes
  maxSize: 100
};
```

## 🔍 Testing in Production

### Smoke Tests
```bash
# Run basic functionality tests
npm run smoke-test

# Test webhook processing
npm run test-webhook-processing
```

### Load Testing
```bash
# Simulate webhook load
npm run load-test

# Monitor performance
npm run performance-monitor
```

## 📞 Support and Maintenance

### Monitoring Alerts
- Set up alerts for error rates > 5%
- Monitor response times > 30 seconds
- Alert on memory usage > 80%

### Backup Procedures
```bash
# Backup configuration
cp .env .env.backup
cp package.json package.json.backup

# Backup logs
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/
```

### Rollback Procedures
```bash
# Quick rollback to previous version
git checkout HEAD~1
npm install
pm2 restart dependafix

# Verify rollback
npm run health-check
```

## 📋 Post-Deployment Verification

### Functional Tests
- [ ] Pull request analysis works
- [ ] Manual trigger (`/dependafix`) works
- [ ] Error detection is accurate
- [ ] Reports are generated correctly

### Performance Tests
- [ ] Response times < 30 seconds
- [ ] Memory usage < 2GB
- [ ] No infinite loops
- [ ] Proper cleanup of temporary files

### Security Tests
- [ ] No sensitive data in logs
- [ ] Proper authentication
- [ ] Input validation working
- [ ] No unauthorized access

## 🎯 Success Metrics

### Key Performance Indicators
- **Error Detection Accuracy**: > 95%
- **Response Time**: < 30 seconds
- **Uptime**: > 99.9%
- **User Satisfaction**: > 4.5/5

### Monitoring Dashboard
```bash
# Access monitoring dashboard
npm run dashboard

# View metrics
npm run metrics
```

---

**Production Status**: ✅ Ready for deployment
**Version**: 2.0.0
**Last Updated**: 2025-08-30
