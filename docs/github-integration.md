# GitHub Integration Architecture

## Overview
This document outlines the architecture for integrating Vestige with GitHub to provide automated code insights on Pull Requests and commits.

## Components

### 1. GitHub App
A GitHub App that listens to webhook events and analyzes code changes.

**Required Permissions:**
- Read access to code
- Read/Write access to pull requests (for comments)
- Read/Write access to checks (for status checks)

**Webhook Events:**
- `pull_request` (opened, synchronize)
- `push` (to analyze commits)

### 2. Backend Service
A Node.js service that processes webhook events.

**Tech Stack:**
- Express.js for webhook handling
- `simple-git` for git operations
- Vestige analysis logic (extracted from extension)

**API Endpoints:**
- `POST /webhook` - GitHub webhook receiver
-GET /health` - Health check

### 3. Analysis Engine
Reuses Vestige's core analysis logic:
- Bus factor calculation
- Churn detection
- Epoch detection
- Coupling analysis

**Workflow:**
1. Webhook received→ Clone/pull repo
2. Analyze changed files
3. Generate insights
4. Post PR comment or status check

### 4. PR Comment Template

```markdown
## 🗿 Vestige Insights

### Files Analyzed: 3

#### ⚠️ High Risk Files
- `auth.js` - Bus Factor: 1 (only Sarah knows this code)
- `database.js` - 🔥 High churn (15 recent changes)

#### ✅ Healthy Files
- `utils.js` - Well-distributed ownership

### Recommendations
- Consider pair programming on `auth.js` to improve bus factor
- `database.js` may benefit from refactoring
```

### 5. Status Check
**Check Name:** `vestige/code-health`

**Statuses:**
- ✅ Success: All files healthy
- ⚠️ Neutral: Some concerns
- ❌ Failure: Critical issues (bus factor 1 on critical files)

## Deployment

### Option 1: Hosted Service
Deploy backend to:
- Heroku
- AWS Lambda
- Vercel

### Option 2: Self-Hosted
Organizations can run their own instance for privacy.

## Security Considerations
- Webhook signature verification
- Rate limiting
- API key management
- Repository access control

## Future Enhancements
- GitLab support
- Bitbucket support
- Slack/Teams notifications
- Custom rulesets per repo

## Implementation Status
⏳ **Architecture Only** - Requires separate backend service deployment.

To implement, extract core Vestige logic into shared library and build Express backend with GitHub App integration.
