/**
 * PostAPI Panel — Collection Tree Component
 * Recursively renders collections, folders, and requests in a collapsible sidebar tree.
 * Integrates storage callbacks to sync tree state in real-time.
 */

import storage from '../lib/storage.js';
import { generateId } from '../lib/utils.js';

class CollectionTree extends HTMLElement {
  constructor() {
    super();
    this._collections = [];
    this._requests = [];
    this._expandedFolders = new Set();
  }

  connectedCallback() {
    this.render();
    this.refresh();
    
    // Subscribe to storage changes
    this._unsubscribe = storage.onChange(() => {
      this.refresh();
    });
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
  }

  async refresh() {
    this._collections = await storage.getCollections();
    this._requests = await storage._getAllRequests();
    this.render();
  }

  render() {
    this.innerHTML = `
      <div class="collection-tree flex flex-col h-full">
        <!-- Tree Header Actions -->
        <div class="flex items-center justify-between p-2 border-b" style="border-bottom: 1px solid var(--border);">
          <span class="font-bold text-secondary" style="font-size: 12px;" data-i18n="collections">Collections</span>
          <div class="flex items-center gap-1">
            <button class="btn btn-ghost btn-sm" id="btn-new-collection" title="New Collection" style="height: 24px; padding: 0 6px; font-size: 11px;">
              + Collection
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" id="btn-import-collection" title="Import Postman Collection" style="width: 24px; height: 24px;">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- Collections Tree list -->
        <div class="tree-list flex-1 overflow-y-auto p-2" style="background-color: var(--bg-panel);">
          <!-- Dynamic rendering -->
          <div id="tree-root"></div>
        </div>
      </div>
    `;

    this._setupUIListeners();
    this._renderTree();
  }

  _setupUIListeners() {
    // New Collection
    const newColBtn = this.querySelector('#btn-new-collection');
    newColBtn.addEventListener('click', async () => {
      const name = prompt('Enter collection name:', 'New Collection');
      if (name && name.trim()) {
        await storage.saveCollection({
          name: name.trim(),
          folders: []
        });
        this.refresh();
      }
    });

    // Import Collection
    const importBtn = this.querySelector('#btn-import-collection');
    importBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('collection-import-trigger', { bubbles: true }));
    });
  }

  _renderTree() {
    const rootEl = this.querySelector('#tree-root');
    if (!rootEl) return;

    if (this._collections.length === 0) {
      rootEl.innerHTML = `
        <div class="text-muted p-4 text-center" style="font-size: 12px; margin-top: 20px;">
          No collections created.
        </div>
      `;
      return;
    }

    rootEl.innerHTML = '';
    this._collections.forEach(col => {
      const colEl = this._createCollectionNode(col);
      rootEl.appendChild(colEl);
    });

    if (window.i18n) window.i18n.translatePage(rootEl);
  }

  _createCollectionNode(col) {
    const node = document.createElement('div');
    node.className = 'tree-collection-node mb-2';
    node.setAttribute('data-id', col.id);

    // Expand state
    const isExpanded = this._expandedFolders.has(col.id);

    node.innerHTML = `
      <div class="tree-item flex items-center justify-between p-1.5 rounded cursor-pointer hover:bg-hover" style="height: 30px; font-weight: 500; font-size: 12px;">
        <div class="flex items-center gap-1.5 flex-1">
          <span class="tree-toggle" style="color: var(--text-muted); padding: 2px;">${isExpanded ? '▼' : '▶'}</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--secondary);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          <span class="collection-name text-ellipsis flex-1">${this._escapeHtml(col.name)}</span>
        </div>
        <div class="col-actions flex items-center opacity-0 hover:opacity-100 gap-1">
          <button class="btn btn-icon btn-sm btn-add-folder" title="Add Folder" style="width: 18px; height: 18px;">+</button>
          <button class="btn btn-icon btn-sm btn-export-col" title="Export Collection" style="width: 18px; height: 18px;">
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button class="btn btn-icon btn-sm btn-delete-col" title="Delete Collection" style="width: 18px; height: 18px; color: var(--error);">×</button>
        </div>
      </div>
      <div class="collection-children pl-4 mt-0.5 ${isExpanded ? '' : 'hidden'}" style="border-inline-start: 1px dashed var(--border); margin-inline-start: 8px;"></div>
    `;

    // Toggle click
    const header = node.querySelector('.tree-item');
    header.addEventListener('click', (e) => {
      // Ignore if clicking action buttons
      if (e.target.closest('.col-actions')) return;

      const toggle = header.querySelector('.tree-toggle');
      const children = node.querySelector('.collection-children');
      if (this._expandedFolders.has(col.id)) {
        this._expandedFolders.delete(col.id);
        toggle.textContent = '▶';
        children.classList.add('hidden');
      } else {
        this._expandedFolders.add(col.id);
        toggle.textContent = '▼';
        children.classList.remove('hidden');
      }
    });

    // Action: Add Folder
    node.querySelector('.btn-add-folder').addEventListener('click', async (e) => {
      e.stopPropagation();
      const folderName = prompt('Enter folder name:');
      if (folderName && folderName.trim()) {
        const folders = col.folders || [];
        folders.push({
          id: generateId(),
          name: folderName.trim(),
          requests: []
        });
        await storage.saveCollection({ ...col, folders });
        this._expandedFolders.add(col.id);
        this.refresh();
      }
    });

    // Action: Export Collection
    node.querySelector('.btn-export-col').addEventListener('click', (e) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent('collection-export-trigger', {
        detail: { collectionId: col.id },
        bubbles: true
      }));
    });

    // Action: Delete Collection
    node.querySelector('.btn-delete-col').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete collection "${col.name}" and all its requests?`)) {
        await storage.deleteCollection(col.id);
        this.refresh();
      }
    });

    // Populate children (folders and root requests)
    const childrenContainer = node.querySelector('.collection-children');
    
    // Folders
    const folders = col.folders || [];
    folders.forEach(folder => {
      const folderNode = this._createFolderNode(col, folder);
      childrenContainer.appendChild(folderNode);
    });

    // Requests directly under collection
    const colRequests = this._requests.filter(r => r.collectionId === col.id && !r.folderId);
    colRequests.forEach(req => {
      const reqNode = this._createRequestNode(req);
      childrenContainer.appendChild(reqNode);
    });

    return node;
  }

  _createFolderNode(col, folder) {
    const node = document.createElement('div');
    node.className = 'tree-folder-node my-1';
    node.setAttribute('data-id', folder.id);

    const isExpanded = this._expandedFolders.has(folder.id);

    node.innerHTML = `
      <div class="tree-item flex items-center justify-between p-1 rounded cursor-pointer hover:bg-hover" style="height: 28px; font-size: 12px;">
        <div class="flex items-center gap-1.5 flex-1">
          <span class="tree-toggle" style="color: var(--text-muted); padding: 2px;">${isExpanded ? '▼' : '▶'}</span>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--warning);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          <span class="folder-name text-ellipsis flex-1">${this._escapeHtml(folder.name)}</span>
        </div>
        <div class="folder-actions flex items-center opacity-0 hover:opacity-100 gap-1">
          <button class="btn btn-icon btn-sm btn-delete-folder" title="Delete Folder" style="width: 18px; height: 18px; color: var(--error);">×</button>
        </div>
      </div>
      <div class="folder-children pl-4 mt-0.5 ${isExpanded ? '' : 'hidden'}" style="border-inline-start: 1px dashed var(--border); margin-inline-start: 8px;"></div>
    `;

    const header = node.querySelector('.tree-item');
    header.addEventListener('click', (e) => {
      if (e.target.closest('.folder-actions')) return;

      const toggle = header.querySelector('.tree-toggle');
      const children = node.querySelector('.folder-children');
      if (this._expandedFolders.has(folder.id)) {
        this._expandedFolders.delete(folder.id);
        toggle.textContent = '▶';
        children.classList.add('hidden');
      } else {
        this._expandedFolders.add(folder.id);
        toggle.textContent = '▼';
        children.classList.remove('hidden');
      }
    });

    // Action: Delete Folder
    node.querySelector('.btn-delete-folder').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete folder "${folder.name}"? Requests inside will be moved to collection root.`)) {
        // Move folder requests to collection root
        const folderReqs = this._requests.filter(r => r.folderId === folder.id);
        for (const req of folderReqs) {
          await storage.saveRequest({ ...req, folderId: null });
        }

        // Remove folder from collection
        const updatedFolders = col.folders.filter(f => f.id !== folder.id);
        await storage.saveCollection({ ...col, folders: updatedFolders });
        this.refresh();
      }
    });

    // Populate folder requests
    const childrenContainer = node.querySelector('.folder-children');
    const folderRequests = this._requests.filter(r => r.folderId === folder.id);
    folderRequests.forEach(req => {
      const reqNode = this._createRequestNode(req);
      childrenContainer.appendChild(reqNode);
    });

    return node;
  }

  _createRequestNode(req) {
    const node = document.createElement('div');
    node.className = 'tree-request-node my-1 flex items-center justify-between p-1 rounded cursor-pointer hover:bg-hover';
    node.setAttribute('data-id', req.id);
    node.style.height = '26px';
    node.style.fontSize = '11px';

    node.innerHTML = `
      <div class="flex items-center gap-1.5 flex-1 min-width-0">
        <span class="method-badge method-${req.method.toLowerCase()} font-mono font-bold" style="font-size: 8px; min-width: 32px; padding: 1px 3px; line-height: 1;">
          ${req.method}
        </span>
        <span class="request-name text-ellipsis flex-1" style="color: var(--text-primary); font-family: var(--font-mono);">${this._escapeHtml(req.name || req.url || 'Untitled Request')}</span>
      </div>
      <button class="btn btn-icon btn-sm btn-delete-request opacity-0 hover:opacity-100" title="Delete Request" style="width: 16px; height: 16px; color: var(--error);">
        ×
      </button>
    `;

    node.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-request')) return;

      this.dispatchEvent(new CustomEvent('request-load-trigger', {
        detail: { requestId: req.id },
        bubbles: true
      }));
    });

    node.querySelector('.btn-delete-request').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete request "${req.name || 'Untitled Request'}"?`)) {
        await storage.deleteRequest(req.id);
        this.refresh();
      }
    });

    return node;
  }

  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

customElements.define('postapi-collection-tree', CollectionTree);
export default CollectionTree;
