const { execSync } = require('child_process');

function getGitInfo() {
  try {
    const commitHash = execSync('git rev-parse --short HEAD').toString().trim();
    const branch = execSync('git branch --show-current').toString().trim();
    const commitTime = execSync('git log -1 --format=%ct').toString().trim();
    return { commitHash, branch, commitTime };
  } catch {
    return { commitHash: 'unknown', branch: 'unknown', commitTime: '0' };
  }
}

const gitInfo = getGitInfo();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_GIT_COMMIT: gitInfo.commitHash,
    NEXT_PUBLIC_GIT_BRANCH: gitInfo.branch,
    NEXT_PUBLIC_GIT_COMMIT_TIME: gitInfo.commitTime,
    NEXT_PUBLIC_BUILD_TIME: Date.now().toString(),
  },
};

module.exports = nextConfig;
