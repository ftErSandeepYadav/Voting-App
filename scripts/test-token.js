#!/usr/bin/env node

/**
 * Test GitHub Token Permissions
 * 
 * This script checks if your GitHub token has the necessary permissions
 * for the TODO to Issue automation.
 */

const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'ftErSandeepYadav/Voting-App';

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const scopes = res.headers['x-oauth-scopes'] || '';
        try {
          const parsed = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data: parsed, scopes });
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

async function testToken() {
  console.log('=== GitHub Token Permission Test ===\n');
  
  if (!GITHUB_TOKEN) {
    console.error('❌ Error: GITHUB_TOKEN environment variable is not set');
    console.log('\nTo run this test:');
    console.log('  export GITHUB_TOKEN=your_token_here');
    console.log('  node scripts/test-token.js');
    process.exit(1);
  }

  console.log('Repository:', GITHUB_REPOSITORY);
  console.log('');

  // Test 1: Check token scopes
  console.log('1. Checking token scopes...');
  try {
    const options = {
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Token-Test-Script',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const result = await makeRequest(options);
    console.log('✅ Token is valid');
    console.log('   User:', result.data.login);
    console.log('   Scopes:', result.scopes || 'No scopes header (might be a PAT with all scopes)');
    console.log('');

    const scopes = result.scopes.split(',').map(s => s.trim());
    const requiredScopes = ['repo', 'project'];
    const hasRepo = scopes.includes('repo') || scopes.includes('public_repo');
    const hasProject = scopes.includes('project') || scopes.includes('read:project');

    if (!hasRepo) {
      console.log('⚠️  Warning: Missing "repo" scope (needed to create issues)');
    } else {
      console.log('✅ Has repository access');
    }

    if (!hasProject) {
      console.log('⚠️  Warning: Missing "project" scope (needed to add issues to projects)');
    } else {
      console.log('✅ Has project access');
    }
    console.log('');

  } catch (error) {
    console.log('❌ Failed:', error.message);
    console.log('');
  }

  // Test 2: Check repository access
  console.log('2. Testing repository access...');
  try {
    const [owner, repo] = GITHUB_REPOSITORY.split('/');
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}`,
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Token-Test-Script',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const result = await makeRequest(options);
    console.log('✅ Can access repository');
    console.log('   Permissions: push =', result.data.permissions?.push || false,
                ', admin =', result.data.permissions?.admin || false);
    console.log('');
  } catch (error) {
    console.log('❌ Cannot access repository:', error.message);
    console.log('');
  }

  // Test 3: Check if can create issues
  console.log('3. Testing issue creation permissions...');
  try {
    const [owner, repo] = GITHUB_REPOSITORY.split('/');
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/issues`,
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Token-Test-Script',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    await makeRequest(options);
    console.log('✅ Can access issues (likely can create them)');
    console.log('');
  } catch (error) {
    console.log('❌ Cannot access issues:', error.message);
    console.log('');
  }

  // Test 4: Check project access (GraphQL)
  console.log('4. Testing project access...');
  try {
    const [owner] = GITHUB_REPOSITORY.split('/');
    const projectNumber = 2;

    const query = `
      query($owner: String!, $number: Int!) {
        user(login: $owner) {
          projectV2(number: $number) {
            id
            title
            number
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
        'User-Agent': 'Token-Test-Script',
        'Content-Type': 'application/json'
      }
    };

    const result = await makeRequest(options, {
      query,
      variables: { owner, number: projectNumber }
    });

    if (result.data.data?.user?.projectV2) {
      const project = result.data.data.user.projectV2;
      console.log('✅ Found user project!');
      console.log('   Title:', project.title);
      console.log('   Number:', project.number);
      console.log('   ID:', project.id);
      console.log('');
    } else if (result.data.errors) {
      console.log('⚠️  User project not found');
      console.log('   Error:', result.data.errors[0].message);
      console.log('');
      
      // Try organization
      console.log('   Trying as organization...');
      const orgQuery = `
        query($owner: String!, $number: Int!) {
          organization(login: $owner) {
            projectV2(number: $number) {
              id
              title
              number
            }
          }
        }
      `;
      
      const orgResult = await makeRequest(options, {
        query: orgQuery,
        variables: { owner, number: projectNumber }
      });
      
      if (orgResult.data.data?.organization?.projectV2) {
        const project = orgResult.data.data.organization.projectV2;
        console.log('   ✅ Found organization project!');
        console.log('      Title:', project.title);
        console.log('      Number:', project.number);
        console.log('      ID:', project.id);
        console.log('');
      } else {
        console.log('   ⚠️  Organization project also not found');
        console.log('   Error:', orgResult.data.errors?.[0]?.message || 'Unknown error');
        console.log('');
        console.log('   This means:');
        console.log('   - Project #2 might not exist');
        console.log('   - It might be a "Projects (classic)" not "Projects (beta/v2)"');
        console.log('   - The token might not have project permissions');
        console.log('');
      }
    }
  } catch (error) {
    console.log('❌ GraphQL query failed:', error.message);
    console.log('');
  }

  // Summary
  console.log('=== Summary ===');
  console.log('');
  console.log('To fix any issues:');
  console.log('1. Go to: https://github.com/settings/tokens');
  console.log('2. Click on your token (or create a new one)');
  console.log('3. Make sure these scopes are checked:');
  console.log('   ✓ repo (Full control of private repositories)');
  console.log('   ✓ project (Full control of projects)');
  console.log('4. Update the token in your repository secrets');
  console.log('');
  console.log('For Projects (beta):');
  console.log('- Your project URL: https://github.com/users/' + GITHUB_REPOSITORY.split('/')[0] + '/projects/2');
  console.log('- Classic projects don\'t work with this script');
  console.log('- Create a new Projects (beta) if needed');
  console.log('');
}

testToken().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
