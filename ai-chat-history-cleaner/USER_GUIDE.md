# Chat History Cleaner — User Guide

Applies to version **1.2.0**.

Chat History Cleaner lets you review your ChatGPT or Claude conversations, keep the ones you want, and delete selected chats. It runs in Chrome’s side panel beside the selected chat website. Every conversation starts on **Keep**.

## Install and open

You need Chrome 116 or newer and a signed-in account at [chatgpt.com](https://chatgpt.com) or [claude.ai](https://claude.ai). There is no build step, API key, or separate server to configure.

1. Extract `chat-history-cleaner.zip` if you received the extension as a ZIP.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the `chat-history-cleaner` folder containing `manifest.json`.
5. Open ChatGPT or Claude and sign in. Make the tab for the provider you want to clean active.
6. Open Chrome’s extensions menu, pin **Chat History Cleaner**, and click its icon.
7. In the side panel, click **Load chats**.

Loading can take a while for a large history. The status message reports how many chats have been found. Review controls become available after conversation loading finishes. Avoid editing history or switching accounts while it loads.

## Choose a provider

Click **Load chats** while the intended ChatGPT or Claude tab is active. The header shows which provider is loaded; the confirmation names it again. The extension uses the selected account/workspace in that website and does not combine providers or workspaces.

Switching the active tab or navigating the bound tab to another website clears the review and stops further queue work. Load again to start a fresh review. Account/workspace changes are checked before confirmation and before every deletion. An already submitted request may still finish.

## Understand the list

**Claude:** conversations appear in one flat list, newest first. Search matches titles. Project conversations are included when returned by Claude’s history API, but Claude project grouping and project-name search are deferred. Use the main Select All, Invert, and Keep All controls; the General chats button is a ChatGPT feature.

**ChatGPT:** the grouped behavior below remains available.

The extension shows **General chats** first, followed by your existing projects in alphabetical order. Within each section, chats appear newest first.

- Each section starts expanded. Click its heading to collapse or expand it.
- Section counts show the total number of chats in that group and how many are marked for deletion.
- Archived chats remain in their general/project section with an **Archived** label.
- Empty groups are hidden.
- Custom GPT conversations appear under General chats unless their identifier identifies a project.
- If a project’s name is unavailable, its chats appear under a distinct **Unnamed project … (name unavailable)** heading. Check the error log for a project-loading warning.

Grouping reflects existing project membership. The extension does not move chats between projects or create projects.

## Choose what to keep or delete

Each chat has a checkbox and a **Keep** or **Delete** label:

- Unchecked / **Keep**: leave this conversation alone.
- Checked / **Delete**: include this conversation in the next deletion confirmation.

Checking a box only marks a chat. It does not send a deletion request.

### Search and bulk controls

Search matches titles without regard to capitalization. In ChatGPT it also matches project names; searching a project name shows its chats.

| Control | Effect |
| --- | --- |
| **Select All** in the main toolbar | Mark every matching chat Delete, including matches in collapsed sections. |
| **Invert** | Switch each matching chat from Keep to Delete or Delete to Keep. |
| **Keep All** | Set every matching chat to Keep. |
| **Select All to Delete** inside General chats | Mark every general chat Delete, including general chats hidden by search. Preserve existing project selections. |

Search does not clear previous selections. A selected chat hidden by the current search still counts toward deletion. Clear search to review the complete list before proceeding.

Collapsing sections also preserves selections. Section counts describe the whole group, even when search shows only some of its chats.

### Example: mark only ChatGPT general chats

1. Load the chats and clear the search field.
2. If you have already selected anything, click the main toolbar’s **Keep All** to clear all selections.
3. Expand **General chats** and click **Select All to Delete**.
4. Review the marked count and the general-chat selections.
5. Continue with **Save & Proceed** when ready.

The General chats button preserves project selections that were already marked. Step 2 ensures those earlier selections are cleared when your intention is to delete only general chats.

## Confirm and run deletion

Deletion cannot be undone by this extension. Export your data through the originating website beforehand if you need a backup.

1. Click **Save & Proceed**. The extension saves the selected chat IDs and provider/tab/account/workspace context for the current browser session and opens a confirmation with the exact deletion count.
2. Check that the count matches your intention. It includes selected chats hidden by search or collapsed sections.
3. Choose **Go back** or press Escape to return without deleting anything.
4. Choose **Delete marked chats** to begin.

Keep the side panel, its originating ChatGPT or Claude tab, and Chrome open until the operation finishes.

The extension deletes one conversation at a time, waiting at least 1.2 seconds between conversations. It retries temporary network errors, rate limits, and server errors up to three times after the initial attempt. A server-requested wait can make a retry take longer.

The progress bar counts processed chats. The accompanying text separately reports how many were deleted, failed, or left unprocessed. Successful deletions disappear from the extension’s list. Refresh the originating website afterward to update its own sidebar.

## Stop, retry, or start over

- Click **Stop after current request** to interrupt waiting and stop before the next request. A request already submitted can still complete; each network request has a 30-second timeout.
- Failed and unprocessed chats stay selected in the current panel. Review them and use **Save & Proceed** again for a new confirmation.
- An authentication or unexpected-response error stops the batch. Resolve the problem before retrying.
- Closing the panel stops further queue work after an in-flight request. There is no automatic resume when you reopen it.
- Clicking **Load chats** starts a fresh review: selections reset to Keep, search and the current review log reset, and ChatGPT sections reset to expanded.

## Error log and troubleshooting

Expand **Error & retry log** to inspect failures and retries. **Download log** saves a text file. Logs can contain conversation IDs, so share them only with people who need them.

| Symptom | What to do |
| --- | --- |
| “Make a signed-in chatgpt.com or claude.ai tab active” | Switch to the intended website tab, sign in if needed, then click Load chats. |
| Load chats finishes with an error | Check the log. Resolve sign-in or connection problems, keep history stable, then load again. Deletion stays disabled for an incomplete load. |
| HTTP 401 | Sign in to the selected website again, then reload the list. |
| HTTP 403 | Open the selected website and resolve any access or browser-verification prompt, then reload. |
| HTTP 429 / long retry wait | Let the backoff finish, or stop the batch and try later. |
| “Account changed” | Select the intended account/workspace and load a fresh list. |
| Unnamed project sections | Names could not be resolved. Chat grouping remains available with fallback labels; retry loading later. |
| Deletion was not acknowledged | Check the chat in its originating website and reload the list before retrying; the extension could not confirm the response. |
| Missing chats | The list covers conversations exposed by the API for the session’s workspace. Other workspaces, temporary/deleted chats, and unavailable local histories are outside that list. |

These are private website endpoints and can change. An extension update may be needed if the log reports an unexpected API response.

## Update or remove

When upgrading from ChatGPT-only versions, Chrome may request permission to access claude.ai.

To update an unpacked installation, replace the files in the folder Chrome originally loaded, then click the extension’s reload button at `chrome://extensions`. If you extracted the update into a different folder, remove the old installation and load the new folder unpacked. Close and reopen the side panel, then click **Load chats**.

To remove the extension, click **Remove** on its card at `chrome://extensions`. Removing it does not restore chats already deleted.

## Privacy and scope

The extension contacts the selected website using your existing signed-in browser session. Its host access is limited to `https://chatgpt.com/*` and `https://claude.ai/*`. It uses no external server or telemetry and requires no token copy/paste.

Credentials are not included in extension logs or selection storage. The current conversation list, selection, and log live in the panel’s memory. A pending confirmation plan containing chat IDs and provider/account/workspace/tab metadata is stored under a unique per-panel key in browser session storage; it is never automatically resumed. Plans are removed on cancel, completion, invalidation, or a new load in that panel. A leftover plan from a closed panel can remain until the browser session ends, but will never execute on its own.

For implementation details, tests, and maintenance, see [Developer Guide](DEVELOPER_GUIDE.md).
