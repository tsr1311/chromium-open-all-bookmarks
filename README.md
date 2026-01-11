# Chromium Open-All-Bookmarks

A Chrome extension that analyzes a Netscape-format bookmarks HTML file (standard export format) and recursively opens them in a structured way using **Windows** and **Tab Groups**.

## Features

- **Smart Structure**:
  - Opens top-level folders as **New Windows**.
  - Groups sub-folders as **Tab Groups** within those windows.
  - Opens duplicate links only once per execution context.
- **Preview Mode**: See exactly what windows and tabs will be created before opening them.
- **Customization Options**:
  - **Omit First Level**: Treat the immediate children of the root folder as the top-level windows (useful if you have a wrapper folder like "Bookmarks Bar").
  - **Add Title Tab**: Creates a focused "dummy" tab at the start of each window displaying the folder name (e.g., `[My Folder]`), helping you identify windows.
  - **Omit Empty Windows**: Automatically filters out windows that would have no content.
- **Advanced Folder Naming (Suffixes)**:
  - **Colored Groups**: Add a color in brackets to the folder name to set the group color.
    - Example: `Social Media[blue]` -> Creates a blue tab group named "Social Media".
    - Supported colors: `grey`, `blue`, `red`, `yellow`, `green`, `pink`, `purple`, `cyan`.
  - **Collapsed Groups**: Add `[collapsed]` to the folder name to open the group in a collapsed state.
    - Example: `Reference[collapsed]` -> Creates a collapsed group named "Reference".
  - *Note: Suffixes are stripped from the final group name.*

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top right).
4. Click **Load unpacked**.
5. Select the directory containing this extension.

## Usage

1. Click the extension icon in the toolbar.
2. Select a Bookmarks HTML file (export from Chrome/Firefox/etc).
3. Adjust options:
    - *Omit first level*
    - *Add Title Tab*
    - *Omit Empty Windows*
4. Click **Preview** to check the structure.
5. Click **Process Bookmarks** to open them.

## Permissions

- `tabs`: To organize and open tabs.
- `tabGroups`: To create and color-code groups.
- `windows`: To manage separate windows for folders.
