# Userscripts

A collection of Tampermonkey/Greasemonkey userscripts.

---

## YT: Dismiss all – not interested

**Install:** [youtube-hide-uninteresting.user.js](https://github.com/achim-t/userscripts/raw/refs/heads/main/youtube-hide-uninteresting/youtube-hide-uninteresting.user.js)

Adds a small floating button to YouTube that marks all visible videos as "Not interested" in one click.

| Action | Effect |
|---|---|
| Click | Dismisses all videos currently in the viewport |
| Shift+Click | Dismisses all videos on the entire page |

The button is hidden by default (low opacity) and expands on hover to show the label. While running it displays progress (`⏳ 3 / 12`) and shows a summary when done. A second click during a run stops it early.

**Works on:** Home feed, Search results, History

**Requires:** Tampermonkey (Firefox / Chrome)
