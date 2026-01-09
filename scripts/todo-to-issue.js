#!/usr/bin/env node

/**
 * TODO to GitHub Issues CI Bot
 *
 * This script scans the repository for TODO comments, creates unique fingerprints,
 * and generates GitHub Issues for new TODOs while avoiding duplicates.
 * It also adds created issues to a GitHub Project (v2).
 */

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY; // format: owner/repo
const PROJECT_NUMBER = parseInt(process.env.PROJECT_NUMBER || '0', 10); // GitHub Project v2 number

// Directories to exclude from scanning
const EXCLUDED_DIRS = [
  '.git',
  '.github', // GitHub workflows and configs (our own automation)
  '.circleci', // CI/CD configs
  '.cursor', // Cursor IDE configs
  '.vscode', // VS Code configs
  '.idea', // IntelliJ configs
  '.wrangler', // Cloudflare Wrangler cache
  'node_modules', // Node.js dependencies
  'vendor', // Go dependencies
  'build', // Build outputs
  'dist', // Distribution outputs
  'out', // Output directories
  'coverage', // Test coverage reports
  '.next', // Next.js build cache
  'bin', // Binary executables
  'git_hooks', // Git hooks (not source code)
  'infra', // Infrastructure configs (could have TODO in comments but typically ops-level)
];

// Issue labels to add
const ISSUE_LABELS = ['engineering', 'todo'];

// Initialize Octokit
const octokit = new Octokit({ auth: GITHUB_TOKEN });

/**
 * Recursively scan directory for TODO comments
 * @param {string} dir - Directory to scan
 * @param {string} rootDir - Root directory for relative path calculation
 * @returns {Array} Array of TODO objects with file path and text
 */
function scanForTodos(dir, rootDir) {
  const todos = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (EXCLUDED_DIRS.includes(entry.name)) {
          continue;
        }
        // Recursively scan subdirectories
        todos.push(...scanForTodos(fullPath, rootDir));
      } else if (entry.isFile()) {
        // Read file and search for TODO comments
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');

          lines.forEach((line, index) => {
            // Match TODO: pattern (case-sensitive)
            const todoMatch = line.match(/TODO:\s*(.+)/);
            if (todoMatch) {
              const todoText = todoMatch[1].trim();
              const relativePath = path.relative(rootDir, fullPath);

              todos.push({
                filePath: relativePath,
                text: todoText,
                lineNumber: index + 1, // For reference, though not required
              });
            }
          });
        } catch (error) {
          // Skip files that can't be read (binary, permissions, etc.)
          if (error.code !== 'EISDIR') {
            console.warn(
              `Warning: Could not read file ${fullPath}: ${error.message}`
            );
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}: ${error.message}`);
  }

  return todos;
}

/**
 * Generate fingerprint for a TODO
 * @param {string} filePath - File path
 * @param {string} todoText - TODO text
 * @returns {string} Fingerprint
 */
function generateFingerprint(filePath, todoText) {
  return `${filePath}|${todoText}`;
}

/**
 * Fetch all existing TODO issues from GitHub
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Array} Array of existing fingerprints
 */
async function fetchExistingTodoIssues(owner, repo) {
  const existingFingerprints = new Set();

  try {
    // Fetch all open issues with 'todo' label
    const iterator = octokit.paginate.iterator(
      octokit.rest.issues.listForRepo,
      {
        owner,
        repo,
        labels: 'todo',
        state: 'open',
        per_page: 100,
      }
    );

    for await (const response of iterator) {
      for (const issue of response.data) {
        // Parse fingerprint from issue body
        const fingerprintMatch = issue.body?.match(/fingerprint=(.+)/);
        if (fingerprintMatch) {
          existingFingerprints.add(fingerprintMatch[1].trim());
        }
      }
    }
  } catch (error) {
    console.error(`Error fetching existing issues: ${error.message}`);
    throw error;
  }

  return existingFingerprints;
}

/**
 * Create a GitHub issue for a TODO
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {object} todo - TODO object
 * @param {string} fingerprint - TODO fingerprint
 * @returns {object} Created issue
 */
async function createIssue(owner, repo, todo, fingerprint) {
  const title = `TODO: ${todo.text}`;
  const body = `**File:** \`${todo.filePath}\`

**TODO:**
${todo.text}

---
**CI_METADATA**
\`\`\`
fingerprint=${fingerprint}
\`\`\`
`;

  try {
    const response = await octokit.rest.issues.create({
      owner,
      repo,
      title,
      body,
      labels: ISSUE_LABELS,
    });

    console.log(`✓ Created issue #${response.data.number}: ${title}`);
    return response.data;
  } catch (error) {
    console.error(
      `Error creating issue for TODO "${todo.text}": ${error.message}`
    );
    throw error;
  }
}

/**
 * Get the GitHub Project v2 ID using GraphQL
 * @param {string} owner - Repository owner (organization)
 * @param {number} projectNumber - Project number
 * @returns {string} Project ID
 */
async function getProjectId(owner, projectNumber) {
  const query = `
    query($number: Int!) {
      viewer{
        projectV2(number: $number) {
          id
        }
      }
    }
  `;

  try {
    const response = await octokit.graphql(query, {
      number: projectNumber,
    });

    return response.viewer.projectV2.id;
  } catch (error) {
    console.error(`Error fetching project ID: ${error.message}`);
    throw error;
  }
}

/**
 * Add issue to GitHub Project v2
 * @param {string} projectId - Project ID
 * @param {string} issueNodeId - Issue node ID
 */
async function addIssueToProject(projectId, issueNodeId) {
  const mutation = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {
        projectId: $projectId
        contentId: $contentId
      }) {
        item {
          id
        }
      }
    }
  `;

  try {
    await octokit.graphql(mutation, {
      projectId,
      contentId: issueNodeId,
    });

    console.log(`  ✓ Added to project #${PROJECT_NUMBER}`);
  } catch (error) {
    console.error(`Error adding issue to project: ${error.message}`);
    // Don't throw - issue was created successfully, project addition is secondary
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🔍 TODO to GitHub Issues CI Bot');
  console.log('================================\n');

  // Validate environment variables
  if (!GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  if (!GITHUB_REPOSITORY) {
    console.error('Error: GITHUB_REPOSITORY environment variable is required');
    process.exit(1);
  }

  const [owner, repo] = GITHUB_REPOSITORY.split('/');

  // Get repository root (current working directory)
  const rootDir = process.cwd();
  console.log(`Scanning repository: ${rootDir}\n`);

  // Step 1: Scan for TODOs
  console.log('Step 1: Scanning for TODO comments...');
  const todos = scanForTodos(rootDir, rootDir);
  console.log(`Found ${todos.length} TODO(s)\n`);

  if (todos.length === 0) {
    console.log('No TODOs found. Exiting.');
    return;
  }

  // Step 2: Fetch existing TODO issues
  console.log('Step 2: Fetching existing TODO issues from GitHub...');
  const existingFingerprints = await fetchExistingTodoIssues(owner, repo);
  console.log(`Found ${existingFingerprints.size} existing TODO issue(s)\n`);

  // Step 3: Filter new TODOs
  console.log('Step 3: Identifying new TODOs...');
  const newTodos = todos.filter(todo => {
    const fingerprint = generateFingerprint(todo.filePath, todo.text);
    return !existingFingerprints.has(fingerprint);
  });
  console.log(`Found ${newTodos.length} new TODO(s) to create\n`);

  if (newTodos.length === 0) {
    console.log('No new TODOs to create. Exiting.');
    return;
  }

  // Step 4: Get Project ID
  console.log('Step 4: Fetching GitHub Project information...');
  let projectId;
  try {
    projectId = await getProjectId(owner, PROJECT_NUMBER);
    console.log(`Project ID: ${projectId}\n`);
  } catch (error) {
    console.warn(
      'Warning: Could not fetch project ID. Issues will be created but not added to project.\n'
    );
  }

  // Step 5: Create issues
  console.log('Step 5: Creating GitHub issues...');
  let createdCount = 0;

  for (const todo of newTodos) {
    const fingerprint = generateFingerprint(todo.filePath, todo.text);

    try {
      const issue = await createIssue(owner, repo, todo, fingerprint);

      // Add to project if we have a project ID
      if (projectId && issue.node_id) {
        await addIssueToProject(projectId, issue.node_id);
      }

      createdCount++;
    } catch (error) {
      console.error(`Failed to process TODO: ${todo.text}`);
    }
  }

  console.log(`\n✅ Complete! Created ${createdCount} new issue(s)`);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
