export async function getBuildMeta() {
  try {
    const response = await fetch(chrome.runtime.getURL('build-meta.json'), { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

export function getReleaseVersion() {
  return chrome.runtime.getManifest().version;
}

export function getDisplayVersion(releaseVersion, buildMeta) {
  return buildMeta?.displayVersion ?? releaseVersion;
}

export function getIssueVersionLabel(releaseVersion, buildMeta) {
  return buildMeta?.displayVersion ?? releaseVersion;
}
