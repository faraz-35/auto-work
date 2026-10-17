import { File, Paths, DownloadTask } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { nativeApplicationVersion } from 'expo-application';
import { RELEASES_API } from '../config';
import { isNewer } from '../logic/version';

export type Release = {
  version: string;   // tag, e.g. "v2.0.5"
  apkUrl: string;
  sizeBytes: number;
};

/** The latest GitHub release when it is newer than the running app, else null. */
export async function checkForUpdate(): Promise<Release | null> {
  const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  const rel = await res.json();
  const apk = (rel.assets ?? []).find((a: { name?: string }) => a.name?.endsWith('.apk'));
  if (!apk || !isNewer(rel.tag_name, nativeApplicationVersion ?? '')) return null;
  return { version: rel.tag_name, apkUrl: apk.browser_download_url, sizeBytes: apk.size };
}

/** Download the APK into the app cache, then hand it to the system installer.
 *  onProgress reports 0..1, or null while the total size is unknown. */
export async function downloadAndInstall(
  release: Release,
  onProgress: (fraction: number | null) => void,
): Promise<void> {
  const file = new File(Paths.cache, 'ghar-update.apk');
  if (file.exists) file.delete();  // stale partial from an earlier attempt
  const task = new DownloadTask(release.apkUrl, file, {
    onProgress: ({ bytesWritten, totalBytes }) =>
      onProgress(totalBytes > 0 ? bytesWritten / totalBytes : null),
  });
  await task.downloadAsync();
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: file.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1,  // FLAG_GRANT_READ_URI_PERMISSION: let the installer read our file
  });
}
