# JobGenius Saver Extension

Minimal Chrome extension to save the current tab as a job in JobGenius.

## Load unpacked in Chrome
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder `apps/extension`.

## Set the API Base URL
1. Click the extension icon to open the popup.
2. Paste your API base URL (for example: `https://jobgenius-platform.vercel.app`).
3. The value is saved automatically.

## Test
1. Open any job listing page in a tab.
2. Click **Save Job** in the extension popup.
3. Visit `/dashboard/saved-jobs` in your web app to confirm the entry appears.