import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export async function checkForUpdates(): Promise<{ available: boolean; version?: string }> {
  try {
    const update = await check();

    if (update) {
      console.log(`Update available: ${update.version}`);

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            console.log(`Downloading ${event.data.contentLength} bytes...`);
            break;
          case 'Progress':
            console.log(`Downloaded ${event.data.chunkLength} bytes`);
            break;
          case 'Finished':
            console.log('Download complete!');
            break;
        }
      });

      await relaunch();
      return { available: true, version: update.version };
    }

    return { available: false };
  } catch (error) {
    console.error('Update check failed:', error);
    return { available: false };
  }
}
