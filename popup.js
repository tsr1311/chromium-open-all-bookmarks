// Popup script to handle file selection and initial parsing.
let parsedTree = null;

document.getElementById('fileInput').addEventListener('change', function (event) {
  const file = event.target.files[0];
  if (!file) {
    document.getElementById('processBtn').disabled = true;
    document.getElementById('previewBtn').disabled = true;
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const content = e.target.result;
    document.getElementById('status').textContent = 'Parsing bookmarks...';

    try {
      parsedTree = parseBookmarks(content);
      document.getElementById('status').textContent = 'File parsed. Ready.';
      document.getElementById('processBtn').disabled = false;
      document.getElementById('previewBtn').disabled = false;
    } catch (err) {
      console.error(err);
      document.getElementById('status').textContent = 'Error parsing file.';
      parsedTree = null;
      document.getElementById('processBtn').disabled = true;
      document.getElementById('previewBtn').disabled = true;
    }
  };

  reader.readAsText(file);
});

async function handleAction(action) {
  if (!parsedTree) return;

  const omitRoot = document.getElementById('omitRoot').checked;
  const addTitleTab = document.getElementById('addTitleTab').checked;
  const omitEmptyWindows = document.getElementById('omitEmptyWindows').checked;

  if (action === 'preview') {
    document.getElementById('previewOutput').textContent = "Generating preview...";
  }

  chrome.runtime.sendMessage({
    action: action,
    tree: parsedTree,
    options: { omitRoot: omitRoot, addTitleTab: addTitleTab, omitEmptyWindows: omitEmptyWindows } // Passed options
  }, (response) => {
    if (chrome.runtime.lastError) {
      document.getElementById('status').textContent = 'Error: ' + chrome.runtime.lastError.message;
    } else if (action === 'preview' && response.preview) {
      document.getElementById('status').textContent = 'Preview generated.';
      renderPreview(response.preview);
    } else {
      document.getElementById('status').textContent = 'Processing started in background.';
    }
  });
}

document.getElementById('processBtn').addEventListener('click', () => handleAction('process_bookmarks'));
document.getElementById('previewBtn').addEventListener('click', () => handleAction('preview'));

// Rendering the preview output in text format
function renderPreview(windows) {
  let output = "";

  windows.forEach((win, index) => {
    const title = win.title ? `[window:${win.title}]` : `[window: #${index + 1}]`;
    output += `${title}\n`;

    win.tabs.forEach(tab => {
      if (tab.type === 'title_tab') {
        output += `     [TITLE TAB: "${tab.title}"]\n`;
      }
      else if (tab.type === 'group') {
        const colorInfo = tab.color ? ` (Color: ${tab.color})` : "";
        const collapsedInfo = tab.collapsed ? ` (collapsed)` : "";
        output += `     [group:${tab.title}]${colorInfo}${collapsedInfo}\n`;
        if (tab.items) {
          const titles = tab.items.map(t => `"${truncate(t.title)}"`).join(', ');
          output += `          [ ${tab.items.length} tabs (${titles}) ]\n`;
        }
      } else if (tab.type === 'link') {
        output += `     [tab "${truncate(tab.title)}"]\n`;
      }
    });
  });

  document.getElementById('previewOutput').textContent = output;
}

function truncate(str) {
  if (!str) return "";
  return str.length > 20 ? str.substring(0, 17) + "..." : str;
}

// --- PARSER ---

function parseBookmarks(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const rootNode = {
    type: 'folder',
    title: "ROOT",
    children: []
  };

  const mainDL = doc.querySelector('dl');

  if (mainDL) {
    parseDL(mainDL, rootNode);
  }

  // Unwrap logic: If ROOT contains exactly 1 folder ("Bookmarks") and nothing else, use that as root.
  // This matches standard export formats.
  if (rootNode.children.length === 1 && rootNode.children[0].type === 'folder' && rootNode.children[0].title === "Bookmarks") {
    return rootNode.children[0];
  }

  return rootNode;
}

function parseDL(dlElement, parentNode) {
  const children = Array.from(dlElement.childNodes);
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.tagName === 'DT') {
      processDT(node, parentNode);
    }
  }
}

function processDT(dtElement, parentNode) {
  const h3 = dtElement.querySelector('h3');
  if (h3) {
    const folderName = h3.textContent;
    const newFolder = {
      type: 'folder',
      title: folderName,
      children: []
    };
    let dl = dtElement.querySelector('dl');
    if (dl) {
      parseDL(dl, newFolder);
    }
    parentNode.children.push(newFolder);
  } else {
    const a = dtElement.querySelector('a');
    if (a) {
      parentNode.children.push({
        type: 'link',
        title: a.textContent,
        url: a.href
      });
    }
  }
}
