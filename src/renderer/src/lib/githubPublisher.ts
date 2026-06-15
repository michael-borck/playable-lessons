/**
 * GitHub Pages publisher using the GitHub API.
 * Uses Personal Access Token authentication (simpler than OAuth device flow for v1).
 */

const API_BASE = 'https://api.github.com'

interface PublishResult {
  url: string
  repoUrl: string
}

const REQUEST_TIMEOUT_MS = 30_000

async function githubFetch(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...options.headers
      }
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`GitHub request timed out (${path})`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Get the authenticated user's login name.
 */
async function getUsername(token: string): Promise<string> {
  const resp = await githubFetch('/user', token)
  if (!resp.ok) throw new Error(`GitHub auth failed: ${resp.status}`)
  const data = await resp.json()
  if (typeof data?.login !== 'string') {
    throw new Error('GitHub API did not return a user login')
  }
  return data.login
}

/**
 * Create a repo if it doesn't exist.
 */
async function ensureRepo(token: string, repoName: string): Promise<string> {
  const username = await getUsername(token)

  // Check if repo exists
  const check = await githubFetch(`/repos/${username}/${repoName}`, token)
  if (check.ok) return username

  // Create it
  const create = await githubFetch('/user/repos', token, {
    method: 'POST',
    body: JSON.stringify({
      name: repoName,
      description: 'Interactive fiction published with Playable Lessons',
      homepage: `https://${username}.github.io/${repoName}`,
      auto_init: true
    })
  })

  if (!create.ok) {
    const err = await create.text()
    throw new Error(`Failed to create repo: ${err}`)
  }

  return username
}

/**
 * Push an HTML file to the gh-pages branch of a repo.
 */
export async function publishToGitHubPages(
  token: string,
  repoName: string,
  htmlContent: string
): Promise<PublishResult> {
  const username = await ensureRepo(token, repoName)
  const repoPath = `/repos/${username}/${repoName}`

  // Encode content as base64
  const base64Content = btoa(unescape(encodeURIComponent(htmlContent)))

  // Check if gh-pages branch exists
  const branchCheck = await githubFetch(`${repoPath}/branches/gh-pages`, token)

  if (!branchCheck.ok) {
    // Create gh-pages branch from default branch
    const defaultRef = await githubFetch(`${repoPath}/git/refs/heads/main`, token)
    let sha: string

    if (defaultRef.ok) {
      const data = await defaultRef.json()
      sha = data?.object?.sha
    } else {
      // Try master
      const masterRef = await githubFetch(`${repoPath}/git/refs/heads/master`, token)
      if (!masterRef.ok) throw new Error('Could not find default branch')
      const data = await masterRef.json()
      sha = data?.object?.sha
    }
    if (typeof sha !== 'string') throw new Error('Could not resolve default branch SHA')

    await githubFetch(`${repoPath}/git/refs`, token, {
      method: 'POST',
      body: JSON.stringify({ ref: 'refs/heads/gh-pages', sha })
    })
  }

  // Check if index.html already exists on gh-pages
  const existingFile = await githubFetch(`${repoPath}/contents/index.html?ref=gh-pages`, token)
  const body: Record<string, string> = {
    message: 'Publish story via Playable Lessons',
    content: base64Content,
    branch: 'gh-pages'
  }

  if (existingFile.ok) {
    const data = await existingFile.json()
    body.sha = data.sha // Required for updates
  }

  const put = await githubFetch(`${repoPath}/contents/index.html`, token, {
    method: 'PUT',
    body: JSON.stringify(body)
  })

  if (!put.ok) {
    const err = await put.text()
    throw new Error(`Failed to publish: ${err}`)
  }

  // Enable GitHub Pages if not already
  await githubFetch(`${repoPath}/pages`, token, {
    method: 'POST',
    body: JSON.stringify({ source: { branch: 'gh-pages', path: '/' } })
  }).catch(() => {}) // Ignore if already enabled

  const url = `https://${username}.github.io/${repoName}`
  const repoUrl = `https://github.com/${username}/${repoName}`

  return { url, repoUrl }
}
