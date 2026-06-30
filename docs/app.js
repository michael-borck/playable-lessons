// Landing page: detect the visitor's platform and point them at the correct
// installer from the latest GitHub Release. Mirrors the cite-sight pattern.
// No server, no tracking, no data sent anywhere except the public GitHub API.

const REPO = 'michael-borck/playable-lessons'
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`
const FALLBACK_URL = `https://github.com/${REPO}/releases/latest`

const PLATFORM_EXT = { mac: '.dmg', windows: '.exe', linux: '.AppImage' }
const PLATFORM_LABEL = { mac: 'macOS', windows: 'Windows', linux: 'Linux' }

/** Sniff the OS from the browser. Defaults to macOS when unsure. */
function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase()
  const platform = (navigator.platform || '').toLowerCase()
  if (platform.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')) return 'mac'
  if (platform.includes('win') || ua.includes('windows')) return 'windows'
  if (ua.includes('linux') || platform.includes('linux')) return 'linux'
  return 'mac'
}

let selectedPlatform = detectPlatform()
let release = null // { tag, assets[] }

/** Fetch the latest release's assets from the GitHub API (unauthenticated). */
async function loadRelease() {
  try {
    const res = await fetch(RELEASES_API)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    release = { tag: data.tag_name, assets: data.assets || [] }
  } catch {
    release = null // API failed or rate-limited — fall back to the releases page.
  }
  render()
}

/** Find the installer asset for a platform by file extension. */
function assetFor(platform) {
  if (!release) return null
  const ext = PLATFORM_EXT[platform]
  return release.assets.find((a) => a.name.endsWith(ext)) || null
}

function render() {
  const btn = document.getElementById('download-btn')
  const versionEl = document.getElementById('version')

  const asset = assetFor(selectedPlatform)
  btn.href = asset ? asset.browser_download_url : FALLBACK_URL
  btn.textContent = `Download for ${PLATFORM_LABEL[selectedPlatform]}`

  if (release?.tag) {
    versionEl.textContent = `Latest release: ${release.tag}`
  } else {
    versionEl.textContent = 'See all releases →'
  }

  // Highlight the active platform toggle.
  document.querySelectorAll('.platform-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.platform === selectedPlatform)
  })
}

// Wire up the manual platform toggle.
document.querySelectorAll('.platform-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedPlatform = btn.dataset.platform
    render()
  })
})

render() // initial paint (before the API responds, shows fallback)
loadRelease()
