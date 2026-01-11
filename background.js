// Background script to process the parsed bookmarks tree recursively.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.tree) {
        if (message.action === 'process_bookmarks') {
            const plan = generatePlan(message.tree, message.options || {});
            executePlan(plan);
            sendResponse({ status: 'started' });
        }
        else if (message.action === 'preview') {
            const plan = generatePlan(message.tree, message.options || {});
            sendResponse({ preview: plan });
        }
    }
    return true;
});

// --- PLANNER (Ordered) ---

function generatePlan(rootNode, options) {
    const windows = [];

    // Helper to add a new independent window
    function addIndependentWindow(title) {
        const win = { title: title || "New Window", tabs: [] };

        // If 'addTitleTab' option is ON, we add a Title Tab marker at the start.
        if (options.addTitleTab) {
            win.tabs.push({ type: 'title_tab', title: title || "Bookmarks" });
        }

        windows.push(win);
        return win;
    }

    // Create the Main Window for the Root.
    const rootWindow = addIndependentWindow(rootNode.title || "Bookmarks");

    // Use the helper to initialize it properly (though we pushed it manully, let's just use the helper and remove if empty)
    // Wait, addIndependentWindow adds to 'windows' array.
    // So 'rootWindow' is already in 'windows'.

    // Recursive function to process children IN ORDER.
    processOrderedChildren(rootNode.children, rootWindow, options.omitRoot);

    // Remove empty root window if we have other content (and root window is unused).
    // Root window is 'unused' if it only contains the title tab (if option on) or is empty.
    const threshold = options.addTitleTab ? 1 : 0;
    if (windows.length > 1 && rootWindow.tabs.length <= threshold) {
        // Technically if we have Title Tab enabled, we might have [TitleTab]. 
        // If that's ALL we have, it's an empty window effectively.
        if (options.addTitleTab && rootWindow.tabs[0].type === 'title_tab' && rootWindow.tabs.length === 1) {
            windows.shift();
        } else if (!options.addTitleTab && rootWindow.tabs.length === 0) {
            windows.shift();
        }
    }

    // Omit Empty Windows Logic
    if (options.omitEmptyWindows) {
        return windows.filter(win => {
            if (options.addTitleTab) {
                // If Title Tab is on, a window is "empty" if it has 1 item (the title tab)
                return win.tabs.length > 1;
            } else {
                return win.tabs.length > 0;
            }
        });
    }

    return windows;

    // --- Inner Recursive Helper ---
    function processOrderedChildren(children, currentWindow, forceWindowForNextLevel) {
        if (!children) return;

        for (const node of children) {
            if (node.type === 'link') {
                // Links always go into the current context window
                currentWindow.tabs.push({ type: 'link', title: node.title, url: node.url });
            }
            else if (node.type === 'folder') {
                // 1. Is it forced to be a window? (e.g. OmitRoot used on top level)
                if (forceWindowForNextLevel) {
                    // Create New Window
                    const newWin = addIndependentWindow(node.title);
                    processOrderedChildren(node.children, newWin, false);
                }
                else {
                    // 2. Standard Logic (Leaf vs Mixed)
                    if (isMixed(node)) {
                        // Mixed -> New Window
                        const newWin = addIndependentWindow(node.title);
                        processOrderedChildren(node.children, newWin, false);
                    } else {
                        // Leaf -> Group in Current Window
                        const links = node.children.filter(c => c.type === 'link');
                        if (links.length > 0) {
                            // Parse suffixes from title: "Name[red][collapsed]" or "Name[collapsed]"
                            // We loop to handle multiple suffixes in any order
                            let title = node.title;
                            let color = null;
                            let collapsed = false;

                            let modified = true;
                            while (modified) {
                                modified = false;
                                // Check Color
                                const colorMatch = title.match(/^(.*)\[(grey|blue|red|yellow|green|pink|purple|cyan)\]\s*$/i);
                                if (colorMatch) {
                                    title = colorMatch[1].trim();
                                    color = colorMatch[2].toLowerCase();
                                    modified = true;
                                    continue;
                                }
                                // Check Collapsed
                                const collapsedMatch = title.match(/^(.*)\[collapsed\]\s*$/i);
                                if (collapsedMatch) {
                                    title = collapsedMatch[1].trim();
                                    collapsed = true;
                                    modified = true;
                                    continue;
                                }
                            }

                            currentWindow.tabs.push({
                                type: 'group',
                                title: title,
                                color: color,
                                collapsed: collapsed,
                                items: links
                            });
                        }
                    }
                }
            }
        }
    }
}

// Check if a node is Mixed (has subfolders)
function isMixed(node) {
    if (!node.children) return false;
    return node.children.some(c => c.type === 'folder');
}

// --- EXECUTOR (Chrome APIs) ---

async function executePlan(windows) {
    for (const winPlan of windows) {

        // 1. Check if first tab is a Title Tab
        let hasTitleTab = false;
        if (winPlan.tabs.length > 0 && winPlan.tabs[0].type === 'title_tab') {
            hasTitleTab = true;
        }

        let windowId = null;

        // 2. Create Window
        if (hasTitleTab) {
            const titleItem = winPlan.tabs[0];
            const safeTitle = titleItem.title || "New Window";
            const dummyUrl = `data:text/html,<html><head><title>${encodeURIComponent(safeTitle)}</title></head><body><h1>${safeTitle}</h1></body></html>`;
            const win = await chrome.windows.create({ url: dummyUrl, focused: true });
            windowId = win.id;
        } else {
            // Standard Creation: Find first URL
            let firstUrl = null;
            for (const item of winPlan.tabs) {
                if (item.type === 'link') { firstUrl = item.url; break; }
                else if (item.type === 'group' && item.items.length > 0) { firstUrl = item.items[0].url; break; }
            }

            if (firstUrl) {
                windowId = await chrome.windows.create({ url: firstUrl, focused: true }).then(w => w.id);
            } else {
                windowId = await chrome.windows.create({ focused: true }).then(w => w.id);
            }
        }

        // 3. Add Content
        let isFirstUrlSkipped = false;

        // If we created window with Title Tab, we don't have a "first URL" conflict, 
        // but we DO need to skip processing the Title Tab item itself loop.

        // If we created window with First URL (No Title Tab), we need to skip that First URL in the loop.
        if (!hasTitleTab) {
            // Determine what the first URL was
            let firstUrl = null;
            for (const item of winPlan.tabs) {
                if (item.type === 'link') { firstUrl = item.url; break; }
                else if (item.type === 'group' && item.items.length > 0) { firstUrl = item.items[0].url; break; }
            }
            if (!firstUrl) isFirstUrlSkipped = true; // Nothing to skip
        }

        // Loop through tabs
        for (const item of winPlan.tabs) {
            if (item.type === 'title_tab') {
                continue; // Already handled (created window with it)
            }

            // Determine active state:
            // If hasTitleTab -> All others are active: false (so title stays focused)
            // If !hasTitleTab -> All created are active: true (default) or false? 
            // Standard behavior: clicking links usually opens active. But opening MANY links, usually first is active, others background.
            // Let's set active: false for all subsequent links to key behavior consistent (one active tab).

            const createActive = false; // Always open subsequent tabs in background

            if (item.type === 'link') {
                if (!hasTitleTab && !isFirstUrlSkipped) {
                    // Verify if this is the first URL
                    let firstUrl = null;
                    for (const i of winPlan.tabs) { if (i.type === 'link') { firstUrl = i.url; break; } else if (i.type === 'group' && i.items.length > 0) { firstUrl = i.items[0].url; break; } }

                    if (item.url === firstUrl) {
                        isFirstUrlSkipped = true;
                        continue;
                    }
                }

                await chrome.tabs.create({ windowId: windowId, url: item.url, active: createActive });
            }
            else if (item.type === 'group') {
                const groupTabIds = [];
                for (const link of item.items) {
                    if (!hasTitleTab && !isFirstUrlSkipped) {
                        let firstUrl = null;
                        for (const i of winPlan.tabs) { if (i.type === 'link') { firstUrl = i.url; break; } else if (i.type === 'group' && i.items.length > 0) { firstUrl = i.items[0].url; break; } }

                        if (link.url === firstUrl) {
                            const tabs = await chrome.tabs.query({ windowId: windowId });
                            groupTabIds.push(tabs[0].id);
                            isFirstUrlSkipped = true;
                            continue;
                        }
                    }
                    const t = await chrome.tabs.create({ windowId: windowId, url: link.url, active: createActive });
                    groupTabIds.push(t.id);
                }

                if (groupTabIds.length > 0) {
                    // Grouping tabs does not affect focus, so simple grouping is fine.
                    const groupId = await chrome.tabs.group({ tabIds: groupTabIds });
                    const updateProps = { title: item.title };
                    if (item.color) {
                        updateProps.color = item.color;
                    }
                    if (item.collapsed) {
                        updateProps.collapsed = true;
                    }
                    await chrome.tabGroups.update(groupId, updateProps);
                }
            }
        }
    }
}
