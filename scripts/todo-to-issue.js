#!/usr/bin/env node

/**
 * TODO to GitHub Issue Automation
 * 
 * This script scans the repository for TODO comments, creates GitHub Issues
 * for new TODOs, and adds them to a GitHub Project v2.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration from environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const PROJECT_NUMBER = parseInt(process.env.PROJECT_NUMBER || '15', 10);

// Directories to exclude from scanning
const EXCLUDED_DIRS = [
  '.git',
  'node_modules',
  'vendor',
  'build',
  'dist',
  'out',
  'coverage',
  '.next',
  '.idea',
  '.vscode'
];

/**
 * Make an HTTPS request (wrapper for both REST and GraphQL)
 */
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Fetch all open issues with 'todo' label using REST API
 */
async function fetchExistingTodoIssues() {
  const [owner, repo] = GITHUB_REPOSITORY.split('/');
  const options = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/issues?labels=todo&state=open&per_page=100`,
    method: 'GET',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'TODO-to-Issue-Bot',
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  console.log('Fetching existing TODO issues...');
  const issues = await makeRequest(options);
  
  // Extract fingerprints from existing issues
  const fingerprints = new Set();
  for (const issue of issues) {
    const match = issue.body?.match(/fingerprint=(.+)/);
    if (match) {
      fingerprints.add(match[1].trim());
    }
  }
  
  console.log(`Found ${fingerprints.size} existing TODO issues`);
  return fingerprints;
}

/**
 * Create a new GitHub Issue using REST API
 */
async function createIssue(todoText, filePath, fingerprint) {
  const [owner, repo] = GITHUB_REPOSITORY.split('/');
  
  const issueBody = `**File:** \`${filePath}\`

---
**CI_METADATA**
fingerprint=${fingerprint}
`;

  const issueData = {
    title: `TODO: ${todoText}`,
    body: issueBody,
    labels: ['engineering', 'todo']
  };

  const options = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/issues`,
    method: 'POST',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'TODO-to-Issue-Bot',
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    }
  };

  console.log(`Creating issue: TODO: ${todoText}`);
  const issue = await makeRequest(options, issueData);
  console.log(`Created issue #${issue.number}`);
  
  return issue;
}

/**
 * Add issue to GitHub Project v2 using GraphQL API
 */
async function addIssueToProject(issueNodeId, projectNumber) {
  const [owner] = GITHUB_REPOSITORY.split('/');
  
  // First, get the project ID
  const projectQuery = `
    query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          id
        }
      }
    }
  `;

  const projectOptions = {
    hostname: 'api.github.com',
    path: '/graphql',
    method: 'POST',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'TODO-to-Issue-Bot',
      'Content-Type': 'application/json'
    }
  };

  console.log(`Fetching project ID for project number ${projectNumber}...`);
  
  try {
    const projectData = await makeRequest(projectOptions, {
      query: projectQuery,
      variables: { owner, number: projectNumber }
    });

    const projectId = projectData.data?.user?.projectV2?.id;
    if (projectId) {
      console.log('Found user project');
      return await addItemToProject(projectId, issueNodeId);
    }
  } catch (error) {
    console.log('User project not found, trying organization...');
  }
  
  // Try as organization
  const orgProjectQuery = `
    query($owner: String!, $number: Int!) {
      organization(login: $owner) {
        projectV2(number: $number) {
          id
        }
      }
    }
  `;
  
  try {
    const orgProjectData = await makeRequest(projectOptions, {
      query: orgProjectQuery,
      variables: { owner, number: projectNumber }
    });
    
    const orgProjectId = orgProjectData.data?.organization?.projectV2?.id;
    if (orgProjectId) {
      console.log('Found organization project');
      return await addItemToProject(orgProjectId, issueNodeId);
    }
  } catch (error) {
    console.error('Organization project not found');
  }
  
  throw new Error(`Could not find project #${projectNumber} for owner "${owner}"`);
}

/**
 * Helper function to add item to project
 */
async function addItemToProject(projectId, issueNodeId) {
  const mutation = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
        item {
          id
        }
      }
    }
  `;

  const options = {
    hostname: 'api.github.com',
    path: '/graphql',
    method: 'POST',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'TODO-to-Issue-Bot',
      'Content-Type': 'application/json'
    }
  };

  console.log('Adding issue to project...');
  const result = await makeRequest(options, {
    query: mutation,
    variables: { projectId, contentId: issueNodeId }
  });

  if (result.data?.addProjectV2ItemById?.item?.id) {
    console.log('Successfully added issue to project');
  }
  
  return result;
}

/**
 * Recursively scan directory for files
 */
function* scanDirectory(dir, baseDir = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip excluded directories
      if (EXCLUDED_DIRS.includes(entry.name)) {
        continue;
      }
      yield* scanDirectory(fullPath, baseDir);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

/**
 * Extract TODO comments from a file
 */
function extractTodos(filePath, baseDir) {
  const todos = [];
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(baseDir, filePath);
    
    // Match TODO: comments in various formats
    // Supports: // TODO:, # TODO:, <!-- TODO: -->, /* TODO: */, etc.
    const todoRegex = /(?:\/\/|#|<!--|\/\*)\s*TODO:\s*(.+?)(?=-->|\*\/|$)/i;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(todoRegex);
      
      if (match) {
        const todoText = match[1].trim();
        todos.push({
          text: todoText,
          filePath: relativePath,
          fingerprint: `${relativePath}|${todoText}`
        });
      }
    }
  } catch (error) {
    // Skip files that can't be read (binary files, permission issues, etc.)
    if (error.code !== 'EISDIR') {
      console.warn(`Warning: Could not read ${filePath}: ${error.message}`);
    }
  }
  
  return todos;
}

/**
 * Main execution
 */
async function main() {
  console.log('=== TODO to GitHub Issue Automation ===\n');
  
  // Validate environment
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    console.error('Error: GITHUB_TOKEN and GITHUB_REPOSITORY must be set');
    process.exit(1);
  }
  
  console.log(`Repository: ${GITHUB_REPOSITORY}`);
  console.log(`Project Number: ${PROJECT_NUMBER}\n`);
  
  // Fetch existing TODO issues
  const existingFingerprints = await fetchExistingTodoIssues();
  
  // Scan repository for TODOs
  console.log('\nScanning repository for TODO comments...');
  const baseDir = process.cwd();
  const allTodos = [];
  
  for (const filePath of scanDirectory(baseDir)) {
    const todos = extractTodos(filePath, baseDir);
    allTodos.push(...todos);
  }
  
  console.log(`Found ${allTodos.length} TODO comments in total\n`);
  
  // Create issues for new TODOs
  let createdCount = 0;
  for (const todo of allTodos) {
    if (!existingFingerprints.has(todo.fingerprint)) {
      try {
        const issue = await createIssue(todo.text, todo.filePath, todo.fingerprint);
        
        // Add to project
        if (issue.node_id) {
          await addIssueToProject(issue.node_id, PROJECT_NUMBER);
        }
        
        createdCount++;
        
        // Rate limiting: wait a bit between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error creating issue for "${todo.text}": ${error.message}`);
      }
    } else {
      console.log(`Skipping duplicate: ${todo.text}`);
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total TODOs found: ${allTodos.length}`);
  console.log(`New issues created: ${createdCount}`);
  console.log(`Skipped (already exist): ${allTodos.length - createdCount}`);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
