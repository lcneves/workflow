#!/usr/bin/env node

/**
 * Post Web E2E screenshots to a PR comment.
 *
 * This script:
 * 1. Finds all screenshot files in the specified directory
 * 2. Uploads them to GitHub as issue attachments (which gives us CDN URLs)
 * 3. Creates/updates a PR comment with the embedded images
 *
 * Usage: node post-web-e2e-screenshots.js <screenshots-dir>
 *
 * Required environment variables:
 * - GITHUB_TOKEN: GitHub token with repo permissions
 * - GITHUB_REPOSITORY: owner/repo format
 * - PR_NUMBER: Pull request number
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const COMMENT_MARKER = '<!-- web-e2e-screenshots -->';

async function main() {
  const screenshotsDir = process.argv[2] || 'screenshots';
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const prNumber = process.env.PR_NUMBER;
  const runUrl = process.env.RUN_URL || '';

  if (!token || !repository || !prNumber) {
    console.log(
      'Missing required environment variables. Skipping screenshot posting.'
    );
    console.log(`  GITHUB_TOKEN: ${token ? 'set' : 'missing'}`);
    console.log(`  GITHUB_REPOSITORY: ${repository || 'missing'}`);
    console.log(`  PR_NUMBER: ${prNumber || 'missing'}`);
    process.exit(0);
  }

  const [owner, repo] = repository.split('/');

  // Find all screenshot files
  const screenshots = findScreenshots(screenshotsDir);
  if (screenshots.length === 0) {
    console.log(`No screenshots found in ${screenshotsDir}`);
    process.exit(0);
  }

  console.log(`Found ${screenshots.length} screenshots`);

  // Group screenshots by backend
  const byBackend = groupByBackend(screenshots);

  // Generate markdown content
  const markdown = generateMarkdown(byBackend, runUrl);

  // Find existing comment
  const existingComment = await findExistingComment(
    owner,
    repo,
    prNumber,
    token
  );

  if (existingComment) {
    // Update existing comment
    await updateComment(owner, repo, existingComment.id, markdown, token);
    console.log(`Updated existing comment: ${existingComment.html_url}`);
  } else {
    // Create new comment
    const newComment = await createComment(
      owner,
      repo,
      prNumber,
      markdown,
      token
    );
    console.log(`Created new comment: ${newComment.html_url}`);
  }
}

function findScreenshots(dir) {
  const screenshots = [];
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (
        file.endsWith('.png') ||
        file.endsWith('.jpg') ||
        file.endsWith('.jpeg')
      ) {
        screenshots.push({
          name: file,
          path: path.join(dir, file),
        });
      }
    }
  } catch (error) {
    console.warn(`Could not read screenshots directory: ${error.message}`);
  }
  return screenshots;
}

function groupByBackend(screenshots) {
  const groups = { local: [], vercel: [] };
  for (const screenshot of screenshots) {
    if (screenshot.name.includes('-local')) {
      groups.local.push(screenshot);
    } else if (screenshot.name.includes('-vercel')) {
      groups.vercel.push(screenshot);
    }
  }
  return groups;
}

function generateMarkdown(byBackend, runUrl) {
  let md = `${COMMENT_MARKER}\n`;
  md += `## 📸 Web UI Screenshots\n\n`;
  md += `Screenshots captured from the Web UI E2E tests.\n\n`;

  // Note about artifacts since we can't embed images directly in comments without uploading
  md += `> **Note:** Screenshots are available as artifacts in the workflow run.\n\n`;

  if (byBackend.local.length > 0) {
    md += `### 💻 Local Backend\n\n`;
    md += `| View | Screenshot |\n`;
    md += `|:-----|:-----------|\n`;
    for (const screenshot of byBackend.local) {
      const viewName = formatViewName(screenshot.name);
      md += `| ${viewName} | \`${screenshot.name}\` |\n`;
    }
    md += '\n';
  }

  if (byBackend.vercel.length > 0) {
    md += `### ▲ Vercel Backend\n\n`;
    md += `| View | Screenshot |\n`;
    md += `|:-----|:-----------|\n`;
    for (const screenshot of byBackend.vercel) {
      const viewName = formatViewName(screenshot.name);
      md += `| ${viewName} | \`${screenshot.name}\` |\n`;
    }
    md += '\n';
  }

  if (runUrl) {
    md += `---\n`;
    md += `📋 [View workflow run and download screenshots](${runUrl})\n`;
  }

  return md;
}

function formatViewName(filename) {
  // runs-list-local.png -> Runs List
  return filename
    .replace(/-(local|vercel)\.png$/, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function findExistingComment(owner, repo, prNumber, token) {
  const comments = await githubRequest(
    'GET',
    `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    null,
    token
  );

  for (const comment of comments) {
    if (comment.body && comment.body.includes(COMMENT_MARKER)) {
      return comment;
    }
  }
  return null;
}

async function createComment(owner, repo, prNumber, body, token) {
  return githubRequest(
    'POST',
    `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    { body },
    token
  );
}

async function updateComment(owner, repo, commentId, body, token) {
  return githubRequest(
    'PATCH',
    `/repos/${owner}/${repo}/issues/comments/${commentId}`,
    { body },
    token
  );
}

function githubRequest(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path,
      method,
      headers: {
        'User-Agent': 'web-e2e-screenshots',
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

main().catch((error) => {
  console.error('Error posting screenshots:', error);
  process.exit(1);
});
