/* All shared functions. */
/* eslint-disable no-unused-vars */

const isBool = arg => typeof arg === 'boolean';

/** Default colors: Red|Orange|Yellow|Green|Blue|Purple|Grey */
const colors = {
  "Default": {  },
  "Red": { value: "#D0312D", clippings: "red", square: "🟥 ", circle: "🔴 ", heart: "❤ ", book: "📕 " },
  "Orange": { value: "#FFA500", clippings: "orange", square: "🟧 ", circle: "🟠 ", heart: "🧡 ", book: "📙 " },
  "Yellow": { value: "#FFD700", clippings: "yellow", square: "🟨 ", circle: "🟡 ", heart: "💛 ", book: "📒 " },
  "Green": { value: "#3CB043", clippings: "green", square: "🟩 ", circle: "🟢 ", heart: "💚 ", book: "📗 " },
  "Blue": { value: "#3457D5", clippings: "blue", square: "🟦 ", circle: "🔵 ", heart: "💙 ", book: "📘 " },
  "Purple": { value: "#A32CC4", clippings: "purple", square: "🟪 ", circle: "🟣 ", heart: "💜 " },
  "Grey": { value: "#808080", clippings: "gray", square: `🔲 `, circle: "⚪ ", heart: "🤍 ", book: "📔 " },
};

/**
 * chrome.i18n helper to pull strings from _locales/[locale]/messages.json
 * @param {string} messageName 
 * @param {string|string[]} substitutions
 * @example
 * // returns "Snippet"
 * i18n("app_name")
 */
const i18n = (messageName, substitutions) => chrome.i18n.getMessage(messageName, substitutions);
/** @type {string} */
const locale = i18n('@@ui_locale');
const i18nOrdinalRules = new Intl.PluralRules(locale.replace('_', '-'));
const i18nSuffixes = {
  'zero': i18n('plural_suffix_zero'),
  'one': i18n('plural_suffix_one'),
  'two': i18n('plural_suffix_two'),
  'few': i18n('plural_suffix_few'),
  'many': i18n('plural_suffix_many'),
  'other': i18n('plural_suffix_other'),
}; // set unused values to the same as other
const i18nOrd = i => i + i18nSuffixes[i18nOrdinalRules.select(i)];

// Storage helpers. Sync must be explicitly enabled.
/**
 * Safely stores data to chrome.storage.local (default) or .sync.
 * @param {{[key:string]:*}} items - a { key: value } object to store
 * @param {boolean} [synced=false] - Whether to store the data in local (false, default) or sync (true).
 */
function setStorageData(items, synced = false) {
  let bucket = synced ? chrome.storage.sync : chrome.storage.local;
  return bucket.set(items).catch(e => e);
}
/**
 * Safely retrieves storage data from chrome.storage.local (default) or .sync.
 * @param {null|string|string[]|{[key:string]:*}} keys - The key name for the stored data.
 * @param {boolean} [synced=false] - Whether to look in local (false, default) or sync (true).
 */
function getStorageData(keys, synced = false) {
  let bucket = synced ? chrome.storage.sync : chrome.storage.local;
  return bucket.get(keys).catch(e => e);
}
/**
 * Safely removes storage data from chrome.storage.local (default) or .sync.
 * @param {string|string[]} keys - The key name for the stored data.
 * @param {boolean} [synced=false] - Whether to look in local (false, default) or sync (true).
 */
function removeStorageData (keys, synced = false) {
  let bucket = synced ? chrome.storage.sync : chrome.storage.local;
  return bucket.remove(keys).catch(e => e);
}

/**
 * 
 * @param {string} text 
 * @param {{value:string}[]} fields 
 * @returns 
 */
const replaceFields = (text, fields) =>
text.replaceAll(/\$\[(.+?)(?:\(.+?\))?(?:\{.+?\})?\]/g, (match, p1) =>
fields.find(field => field.name === p1)?.value);

/**
 * Send text to clipboard
 * @param {string} [plainText] 
 * @param {string} [richText] 
 */
function setClipboard(plainText, richText) {
  // console.log(plainText, richText);
  if(!plainText && !richText) return;
  let item = {};
  if (plainText) item["text/plain"] = new Blob([plainText], { type: "text/plain" });
  if (richText) item["text/html"] = new Blob([richText], { type: "text/html" });
  // console.log(`Copying to clipboard...`);
  return navigator.clipboard.write([new ClipboardItem(item)]).then(() => true).catch(e => e);
}

function testAccess(target) {
  const touchTarget = () => true;
  return injectScript({
    target: target,
    func: touchTarget,
  }).catch(e => e);
}

async function snipSelection(target) {
  const src = {
    target: target,
    func: getFullSelection,
  };
  const results = await injectScript(src);
  let result = results[0]?.result;

  // check for result
  if (!result) return false;
  return new Snippet({ content: result.content });
}

async function pasteSnippet(target, snip) {
  const src = {
    target: target,
    func: placeText,
    args: [snip],
  };
  const results = await injectScript(src);
  return results[0]?.result;
}

// RichText processors
/**
 * Remove newlines and add HTML line break tags where appropriate
 * 
 * * (?<!<\/(?!a|span|strong|em|b|i|q|mark|input|button)[a-zA-Z0-9]+?>\s*?) - don't match if non-inline ending tags are found just before a newline
 * * (?:\r\n|\n) - match newlines on Windows/non-Windows
 * 
 * @param {string} text
 */
const tagNewlines = text => text.replaceAll(
  /(?<!<\/(?!a|span|strong|em|b|i|q|mark|input|button)[a-zA-Z0-9]+?>\s*?)(?:\r\n|\n)/g,
  (match) => `<br>`).replaceAll(/(?:\r\n|\r|\n)/g, ``);
/**
 * Place anchor tags around emails if not already linked
 * 
 * * (?<!<[^>]*) - ignore emails inside tag defs
 * * (?:[a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~] - allowable starting characters
 * * [a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~.]* - allowable characters
 * * [a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~] - allowable ending characters
 * * |[a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~]) - allowable single character
 * * @ - defining email character
 * * (?:(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]+) - domain
 * * (?!(?!<a).*?<\/a>) - ignore emails that are inside an anchor tag
 * 
 * @param {string} text
 */
const linkEmails = text => text.replaceAll(
  /(?<!<[^>]*)(?:[a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~][a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~.]*[a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~]|[a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~])@(?:(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]+)(?!(?!<a).*?<\/a>)/ig,
  (match) => `<a href="mailto:${match}">${match}</a>`);
/**
 * Place anchor tags around urls if not already linked
 * 
 * * <a.+?\/a>| - ignore anchor tags
 * * <[^>]*?>| - ignore anything within tags
 * * ( - start url capture
 * * (?<![.+@a-zA-Z0-9]) - ignore emails and random text
 * * (?:(https?|ftp|chrome|edge|about|file):\/+)? - capture protocols if available
 * * (?: - start domain lookup
 * * (?:[a-zA-Z0-9-]+\.)+[a-zA-Z]+| - find url sequences
 * * (?:[0-9]+\.){3}[0-9]+ - find ipv4 addresses (ipv6 is too complicated for a single line regex)
 * * ) - end domain lookup
 * * (?::[0-9]+)? - include port numbers
 * * (?:\/(?:[a-zA-Z0-9!$&'()*+,-./:;=?@_~#]|%\d{2})*)? - include all allowed url characters after domain
 * * ) - end url capture
 * 
 * @param {string} text
 */
const linkURLs = text => text.replaceAll(
  /<a.+?\/a>|<[^>]*?>|((?<![.+@a-zA-Z0-9])(?:(https?|ftp|chrome|edge|about|file):\/+)?(?:(?:[a-zA-Z0-9]+\.)+[a-z]+|(?:[0-9]+\.){3}[0-9]+)(?::[0-9]+)?(?:\/(?:[a-zA-Z0-9!$&'()*+,-./:;=?@_~#]|%\d{2})*)?)/gi,
  (match, p1, p2) => {
    console.log(match, p1, p2);
    // skip anchors and tag attributes
    if (!p1) return match;
    // skip IP addresses with no protocol
    if (match.match(/^\d+\.\d+\.\d+\.\d+$/)) return match;
    // ensure what was picked up evaluates to a proper url (just in case)
    const matchURL = new URL(((!p2) ? `http://${match}` : match));
    console.log(matchURL);
    return (matchURL) ? `<a href="${matchURL.href}">${match}</a>` : match;
  });

function getRichText(text, {rtLineBreaks, rtLinkEmails, rtLinkURLs}) {
  console.log(text, rtLineBreaks);
  if (rtLineBreaks) text = tagNewlines(text);
  console.log(text, rtLinkEmails);
  if (rtLinkEmails) text = linkEmails(text);
  console.log(text, rtLinkURLs);
  if (rtLinkURLs) text = linkURLs(text);
  console.log(text);
  return text;
}

/**
 * Ensure script injection errors including permission blocks are always handled gracefully.
 * Requires the ["scripting"] permission.
 * @param {Object} src - The details of the script to inject.
 * @param {InjectionTarget} src.target - Details specifying the target into which to inject the script.
 * @param {string[]} src.files - The path of the JS or CSS files to inject, relative to the extension's root directory. Exactly one of files and func must be specified.
 * @param {void} src.func - A JavaScript function to inject. This function will be serialized, and then deserialized for injection. This means that any bound parameters and execution context will be lost. Exactly one of files and func must be specified.
 * @param {*[]} src.args - The arguments to carry into a provided function. This is only valid if the func parameter is specified. These arguments must be JSON-serializable.
 * @param {boolean} src.injectImmediately - Whether the injection should be triggered in the target as soon as possible. Note that this is not a guarantee that injection will occur prior to page load, as the page may have already loaded by the time the script reaches the target.
 * @param {ExecutionWorld} src.world - The JavaScript "world" to run the script in. Defaults to ISOLATED.
 * @returns {Promise<InjectionResult[]>|boolean}
 */
const injectScript = async (src) =>
chrome.scripting.executeScript(src).catch((e) => (console.log(e), false));

/** Injection script workaround for full selectionText with line breaks */
function getFullSelection() {
  const selection = window.getSelection();

  // TODO: add rich text info
  // let range = selection.getRangeAt(0);

  return {
    content: selection.toString(),
    // richText: window.getSelection(),
  };
}

/** Injection script for pasting. Pasting will be done as rich text in contenteditable fields.
 * @param {Snippet} snip */
function placeText(snip) {
  // get clicked element
  const selNode = document.activeElement;
  console.log(snip, selNode);

  /**
   * Paste code
   * @param {string} content 
   * @param {string} richText 
   */
  function paste({ content, richText }) {
    // setup rich text for pasting or updating the clipboard if needed
    richText ||= content;
    // console.log(text);

    // execCommand is deprecated but insertText is still supported in chrome as wontfix
    // and produces the most desirable result. See par. 3 in:
    // https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
    let pasted = false;
    if (selNode.value !== undefined) {
      // paste plaintext into inputs and textareas
      pasted = document.execCommand('insertText', false, content);
      // forward-compatible alt code, kills the undo stack
      if (!pasted) {
        const selVal = selNode.value;
        const selStart = selNode.selectionStart;
        selNode.value = selVal.slice(0, selStart) + content + selVal.slice(selNode.selectionEnd);
        selNode.selectionStart = selNode.selectionEnd = selStart + content.length;
        pasted = true;
      }
    } else { // contenteditable
      // check for plain-text setting
      if (selNode.contentEditable === "plaintext-only") richText = content;

      // ckeditor does not allow any 3rd party programatic inputs in contenteditable fields but fails silently
      if (!selNode.classList.contains("ck")) {
        pasted = document.execCommand('insertHTML', false, richText);
        // forward-compatible alt code, kills the undo stack
        if (!pasted) {
          const sel = window.getSelection();
          const selRng = sel.getRangeAt(0);
          selRng.deleteContents();
          selRng.insertNode(document.createTextNode(richText));
          sel.collapseToEnd();
          pasted = true;
        }
      }
    }

    // event dispatch for editors that handle their own undo stack like stackoverflow
    if (pasted) {
      const keyEvent = {
        bubbles: true,
        cancelable: true,
        composed: true,
      };
      selNode.dispatchEvent(new KeyboardEvent('keydown', keyEvent));
      selNode.dispatchEvent(new InputEvent('input'), {
        bubbles: true,
        composed: true,
        inputType: "inputFromPaste",
        data: richText,
      });
      selNode.dispatchEvent(new KeyboardEvent('keyup', keyEvent));
    }

    return {
      pasted: pasted,
      text: content,
      richText: richText,
    };
  }

  return paste(snip);
}

function getFrameOrigins() {
  const origins = [];
  // add src of all iframes on page so user only needs to request permission once
  for (let frame of document.getElementsByTagName("IFRAME")) {
    if (frame.src && !origins.includes(frame.src)) {
      origins.push((new URL(frame.src).origin) + "/*");
    }
  }
  return origins;
}

// Request permissions when necessary for cross-origin iframes
async function requestFrames(action, target, data, args) {
  // Get site origins
  const results = await injectScript({
    target: { tabId: target.tabId },
    func: getFrameOrigins,
  });
  const origins = results[0]?.result;
  // return script injection error if top level is blocked too
  if (!origins) return false;
  // send data to worker for further processing
  return await chrome.storage.session.set({ request: {
    type: 'permissions',
    action: action,
    target: target,
    data: data,
    args: args,
    origins: origins,
  }}).then(() => true).catch(e => e);
}

/** Base constructor for folders, snippets and any future items */
class TreeItem {
  constructor({ name, seq, color } = {}) {
    /** @type {string} */
    this.name = name || i18n('title_new_generic');
    /** @type {number} */
    this.seq = seq || 1;
    /** @type {string} */
    this.color = color;
  }
}
/** Folders contain tree items and can be nested. */
class Folder extends TreeItem {
  constructor({ name, seq, children, color } = {}) {
    super({
      name: name || i18n('title_new_folder'),
      seq: seq || 1,
      color: color,
    });
    /** @type {(TreeItem|Folder|Snippet)[]} */
    this.children = children || [];
  }
}
/** Snippets are basic text blocks that can be pasted */
class Snippet extends TreeItem {
  constructor({ name, seq, color, content, nosubst, shortcut, sourceURL } = {}) {
    // generate name from content if provided
    if (!name && content) {
      // create snippet title from first line of text
      name = content.match(/^.+/)[0];
      const maxLength = 27;
      if (content.length > maxLength) {
        // cut down to size, then chuck trailing text if possible so no words are cut off
        name = name.slice(0, maxLength + 1);
        name = (name.includes(' ')
                 ? name.slice(0, name.lastIndexOf(' '))
                 : name.slice(0, maxLength))
                 + '…';
      }
    }
    super({
      name: name || i18n('title_new_snippet'),
      seq: seq || 1,
      color: color,
    });
    /** @type {string} */
    this.content = content || "";
    /** @type {boolean} */
    this.nosubst = nosubst;
    /** @type {string} */
    this.shortcut = shortcut;
    /** @type {string} */
    this.sourceURL = sourceURL;
  }
}
/** Basic snippets data bucket */
class DataBucket {
  constructor({ version, children, counters } = {}) {
    /** @type {string} */
    this.version = version || "1.0";
    /** @type {string} */
    this.timestamp = Date.now();
    /** @type {(TreeItem|Folder|Snippet)[]|string} */
    this.children = children || [];
    // console.log("setting counters...", counters);
    const { startVal, ...cs } = counters || {};
    // console.log("double-checking...", startVal, cs);
    this.counters = cs || {};
    this.counters.startVal = +startVal || 0;
  }

  /** Compress root folder (children) using browser gzip compression */
  async compress() {
    // check if already compressed
    if (typeof this.children === 'string') {
      // console.warn("Data is already in compressed form");
      return false;
    }

    // create a compression stream
    const stream = new Blob([JSON.stringify(this.children)], { type: 'application/json' })
      .stream().pipeThrough(new CompressionStream("gzip"));
    // read the compressed stream and convert to b64
    const blob = await new Response(stream).blob();
    const buffer = await blob.arrayBuffer();
    this.children = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return true;
  }

  #cast(item) {
    if (Object.hasOwn(item, "children")) {
      return new Folder(item);
    } else if (Object.hasOwn(item, "content")) {
      return new Snippet(item);
    }
    return item;
  }

  restructure(folder = this.children) {
    // console.log(folder);
    const items = [];
    folder.forEach((item) => {
      // console.log(item);
      if (Object.hasOwn(item, "children")) {
        item.children = this.restructure(item.children);
      }
      items.push(this.#cast(item));
    });
    // console.log(items);
    return items;
  }

  /**
   * Decompress root folder (children) and cast objects as their appropriate TreeItem
   */
  async parse() {
    // check if already compressed and otherwise just cast contents appropriately
    if (typeof this.children !== 'string') {
      this.children = this.restructure();
      return this;
    }

    // decode base64 to gzip binary
    const binData = atob(this.children);
    const len = binData.length;
    const gzipData = new Uint8Array(new ArrayBuffer(len));
    for (let i = 0; i < len; i++) {
      gzipData[i] = binData.charCodeAt(i);
    }

    // create stream for decompression
    const stream = new Blob([gzipData], { type: "application/json" })
      .stream().pipeThrough(new DecompressionStream("gzip"));
    // read the decompressed stream
    const dataBlob = await new Response(stream).blob();
    // return decompressed and deserialized text
    // console.log(dataBlob);
    this.children = this.restructure(JSON.parse(await dataBlob.text()));
    return this;
  }

  /**
   * Check if the data is small enough to fit in a sync storage bucket with the given key name.
   * @param {string} name Key that will be used for retrieving the data (factored into the browser's storage limits)
   * @returns 
   */
  syncable(name) {
    const size = new Blob([JSON.stringify({ [name]: this.data })]).size;
    const maxSize = chrome.storage.sync.QUOTA_BYTES_PER_ITEM;
    return (size <= maxSize);
  }

  /** process data into a clippings compatible object */
  toClippings() {
    /** @param {(TreeItem|Folder|Snippet)[]} folder */
    const mapData = (folder) => folder.map(o =>
    o instanceof Folder ? {
      name: o.name || "",
      children: mapData(o.children) || [],
      seq: o.seq - 1,
    }
    : {
      name: o.name || "",
      content: o.content || "",
      shortcutKey: o.shortcutKey || "",
      sourceURL: o.sourceURL || "",
      label: colors[o.color]?.clippings || "",
      seq: o.seq - 1,
    });
    return {
      version: "6.1",
      createdBy: "Clippings/wx",
      userClippingsRoot: mapData(this.children),
    };
  }
}

/**
 * Space object stores snippet groupings in buckets.
 */
class Space {
  /**
   * @param {{
   *   name: string
   *   synced: boolean
   *   data: DataBucket
   *   path: number[]|string
   * }} details - Space will be empty until `load()` or `init()` are called unless provided
   */
  constructor(details) {
    if (details) this.init(details);
  }

  /**
   * Return the fully named path represented by the seq array provided
   * @param {number[]} path 
   */
  getPathNames(path = this.path) {
    // console.log(this, this.name);
    /** @type {string[]} */
    const pathNames = [this.name];
    let item = this.data;
    // console.log(path[0], pathNames[0], path.length);
    for (let seq of path) {
      // console.log(seq);
      item = item.children.find((i) => i.seq == seq);
      if (!item) {
        // throw new Error("That path doesn't exist");
        return;
      }
      pathNames.push(item.name);
    }
    return pathNames;
  }

  /**
   * 
   * @param {{
   *   name: string
   *   synced: boolean
   *   path: number[]
   * }} args - Name & storage bucket location (reloads current space if empty)
   */
  async load({ name, synced, path = [] } = {}) {
    // console.log("Loading space...", name, synced, typeof synced, path);
    const bucket = await getStorageData(
      name || this.name,
      synced || this.synced,
    );
    // console.log("Getting data from bucket...", bucket);
    const data = bucket[name || this.name];
    // console.log("Confirming data...", data);
    if (!data) return;
    await this.init({
      name: name,
      synced: synced,
      data: data,
      path: path,
    });
    return true;
  }

  async save() {
    // make sure the space has been initialized
    if (!this.name?.length) return;

    // gzip compression adds about 8x more storage space
    const dataBucket = new DataBucket(this.data);
    await dataBucket.compress();

    // ensure synced spaces are syncable and offer to switch otherwise
    if (this.synced && !dataBucket.syncable(this.name)) {
      if (confirm(i18n('warning_sync_full'))) {
        return this.shift({ synced: false });
      }
      return false;
    }

    // store data
    await setStorageData({ [this.name]: dataBucket }, this.synced);
    return true;
  }

  addItem(item, folderPath = this.path) {
    let folder = this.getItem(folderPath).children;
    item.seq = folder.length + 1;
    folder.push(item);
    return item;
  }

  editItem({ seq, field, value, folderPath = this.path }) {
    let item = this.getItem(folderPath.concat([seq]));
    item[field] = value;
    return item;
  }

  deleteItem(seq, folderPath = this.path) {
    /** @type {*[]} */
    const folder = this.getItem(folderPath).children;
    const i = folder.findIndex(o => o.seq === +seq);
    const removedItem = folder.splice(i, 1)[0];
    return removedItem;
  }

  moveItem({ fromPath = this.path, fromSeq, toPath = this.path, toSeq }) {
    let fromFolder = this.getItem(fromPath);
    let fromItem = this.getItem(fromPath.concat([fromSeq]));
    fromSeq = fromFolder.children.indexOf(fromItem);
    let toFolder = this.getItem(toPath);
    if (toSeq) {
      let toItem = this.getItem(toPath.concat([toSeq]));
      toSeq = toFolder.children.indexOf(toItem);
      // if (toSeq > fromSeq) toSeq++;
    } else {
      toSeq = toFolder.children.length;
    }
    try {
      toFolder.children.splice(toSeq, 0,
        fromFolder.children.splice(fromSeq, 1)[0]);
      this.sequence(toFolder);
      if (JSON.stringify(fromPath) !== JSON.stringify(toPath))
        this.sequence(fromFolder);
    } catch (e) {
      // console.error(e);
    }
    return fromItem;
  }

  /**
   * 
   * @param {number[]} path - Full path to the tree item
   * @returns {TreeItem|Folder|Snippet}
   */
  getItem(path) {
    try {
      let item = this.data;
      for (let seq of path) {
        item = item.children.find(o => o.seq === +seq);
      }
      return item;
    } catch (e) {
      // console.error("The path requested does not exist.", path, e);
      return;
    }
  }

  /**
   * Process placeholders and rich text options of a snippet and return the result
   * @param {number} seq 
   * @param {number[]} path 
   * @returns 
   */
  async getProcessedSnippet(seq, path = this.path) {
    // console.log("Getting item...");
    const item = this.getItem(path.concat(seq));
    // console.log(item);
    if (!item?.content) return;
    // avoid touching space
    const snip = new Snippet(item);
    
    // skip processing if Clippings [NOSUBST] flag is prepended to the name
    if (snip.name.slice(0,9).toUpperCase() === "[NOSUBST]") {
      snip.nosubst = true;
      return snip;
    }

    // process counters, kept track internally to allow use across multiple snippets
    // console.log("Processing counters...");
    snip.content = snip.content.replaceAll(/#\[(.+?)(?:\((.+?)\))?\]/g, (match, p1, p2) => {
      if (!snip.counters) snip.counters = [];
      snip.counters.push(p1);
      // console.log(p1, p2, this.data.counters, p1 in this.data.counters);
      if (p1 in this.data.counters === false) {
        // console.log("Adding counter...", p1);
        this.data.counters[p1] = this.data.counters.startVal;
      }
      const val = this.data.counters[p1];
      // console.log(val, typeof val);
      this.data.counters[p1] += isNaN(p2) ? 1 : +p2;
      return val;
    });
    // save space if counters were used and thus incremented
    if (snip.counters?.length) await this.save();
  
    // placeholders
    // console.log("Processing placeholders...");
    snip.content = snip.content.replaceAll(/\$\[(.+?)(?:\((.+?)\))?(?:\{(.+?)\})?\]/g, (match, p1, p2, p3) => {
      if (p3?.includes('|')) p3 = p3.split('|');
      const now = new Date();
  
      // function for full date/time format string replacement (compatible with Clippings)
      /**
       * 
       * @param {string} dateString 
       * @param {*} date 
       */
      const formattedDateTime = (dateString, date) => {
        // helper for setting up date objects
        const datePartsToObject = (obj, item) =>
          (item.type === "literal") ? obj : (obj[item.type] = item.value, obj);
  
        // generate localized replacement objects for full replacement support
        const longDate = new Intl.DateTimeFormat(locale, {
          hourCycle: "h12",
          weekday: "long", day: "numeric", month: "long",
          hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3,
          dayPeriod: "long", timeZoneName: "long", era: "long",
        }).formatToParts(date).reduce(datePartsToObject, {});
        const shortDate = new Intl.DateTimeFormat(locale, {
          hourCycle: "h12",
          weekday: "short", day: "numeric", month: "short",
          hour: "numeric", minute: "numeric", second: "numeric", fractionalSecondDigits: 1,
          timeZoneName: "short", era: "short",
        }).formatToParts(date).reduce(datePartsToObject, {});
        const paddedDate = new Intl.DateTimeFormat(locale, {
          hourCycle: "h23",
          year: "2-digit", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 2,
          timeZoneName: "longOffset",
        }).formatToParts(date).reduce(datePartsToObject, {});
        // numeric date/times will only not be padded if loaded individually
        const numericDate = new Intl.DateTimeFormat(locale, {
          hourCycle: "h23", year: "numeric", hour: "numeric",
        }).formatToParts(date).concat(new Intl.DateTimeFormat(locale, {
          month: "numeric", minute: "numeric",
        }).formatToParts(date).concat(new Intl.DateTimeFormat(locale, {
          day: "numeric", second: "numeric", fractionalSecondDigits: 3,
        }).formatToParts(date))).reduce(datePartsToObject, {});
        // fix numeric 24 hours still being padded for some locals no matter how generated
        if (numericDate.hour.length === 2) numericDate.hour = numericDate.hour.replace(/^0/, "");
  
        // replace each part of format string
        dateString = dateString.replaceAll(/([a-zA-Z]*)(\.s+)?/g, (match, p1, p2) => {
          // split seconds
          if (p2) {
            let seconds = "";
            switch (p1) {
              case "s":
                seconds += numericDate.second;
                break;
            
              case "ss":
                seconds += paddedDate.second;
                break;
            
              default:
                seconds += p1;
                break;
            }
            switch (p2) {
              case ".s":
                seconds += "." + shortDate.fractionalSecond;
                break;
            
              case ".ss":
                seconds += "." + paddedDate.fractionalSecond;
                break;
            
              case ".sss":
                seconds += "." + longDate.fractionalSecond;
                break;
            
              default:
                seconds += p2;
                break;
            }
            return seconds;
          }
          // case sensitive matches
          switch (match) {
            case "m":
              return numericDate.minute;
            case "mm":
              return paddedDate.minute;
            case "M":
              return numericDate.month;
            case "MM":
              return paddedDate.month;
            case "h":
              return shortDate.hour;
            case "hh":
              return longDate.hour;
            case "H":
              return numericDate.hour;
            case "HH":
              return paddedDate.hour;
            case "a":
              return shortDate.dayPeriod;
            case "A":
              return shortDate.dayPeriod.toUpperCase();
            default:
              break;
            }
          // case insensitive matches required for clippings compatibility
          switch (match.toUpperCase()) {
          case "D":
            return numericDate.day;
          case "DD":
            return paddedDate.day;
          case "DDD":
            return shortDate.weekday;
          case "DDDD":
            return longDate.weekday;
          case "DO":
            return i18nOrd(numericDate.day);
          case "MMM":
            return shortDate.month;
          case "MMMM":
            return longDate.month;
          case "Y":
            return paddedDate.slice(-1);
          case "YY":
            return paddedDate.year;
          case "YYY":
            return numericDate.year.slice(-3);
          case "YYYY":
            return numericDate.year;
          case "GG":
            return shortDate.era;
          case "S":
            return numericDate.second;
          case "SS":
            return paddedDate.second;
          case "Z":
            return paddedDate.timeZoneName;
          case "ZZ":
            return paddedDate.timeZoneName.replaceAll(/[^+\-\d]/g, "");
          default:
            break;
          }
          return match;
        });
        return dateString;
      };
      const UA = navigator.userAgent;
      let host;
      switch (p1.toUpperCase()) {
        case "DATE":
          if (p2) {
            // shorthand date options
            if (p2.toUpperCase() === "FULL") return new Intl.DateTimeFormat(locale, {
              dateStyle: "full",
            }).format(now);
            if (p2.toUpperCase() === "LONG") return new Intl.DateTimeFormat(locale, {
              dateStyle: "long",
            }).format(now);
            if (p2.toUpperCase() === "MEDIUM") return new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
            }).format(now);
            if (p2.toUpperCase() === "SHORT") return new Intl.DateTimeFormat(locale, {
              dateStyle: "short",
            }).format(now);
  
            return formattedDateTime(p2, now);
          }
          return now.toLocaleDateString();
  
        case "TIME":
          if (p2) {
            if (p2 === "full") return new Intl.DateTimeFormat(locale, {
              timeStyle: "full",
            }).format(now);
            if (p2 === "long") return new Intl.DateTimeFormat(locale, {
              timeStyle: "long",
            }).format(now);
            if (p2 === "medium") return new Intl.DateTimeFormat(locale, {
              timeStyle: "medium",
            }).format(now);
            if (p2 === "short") return new Intl.DateTimeFormat(locale, {
              timeStyle: "short",
            }).format(now);
  
            return formattedDateTime(p2, now);
          }
          return now.toLocaleTimeString();
  
        case "HOSTAPP":
          host = UA.match(/Edg\/([0-9.]+)/);
          if (host) return "Edge " + host[1];
          host = UA.match(/Chrome\/([0-9.]+)/);
          if (host) return "Chrome " + host[1];
          return match;
  
        case "UA":
          return UA;
  
        case "NAME":
          return snip.name;
  
        case "FOLDER":
          return this.getPathNames(path).pop();
  
        case "PATH":
          return this.getPathNames(path).join(p2 || `/`);
      
        default:
          // custom field, save for future processing (array to maintain order)
          if (!snip.customFields) snip.customFields = [];
          if (!snip.customFields.find(field => field.name === p1)) {
            let field = {
              name: p1,
            };
            if (Array.isArray(p3)) {
              field.type = `select`;
              field.value = p3[0] || ``;
              field.options = p3;
            } else {
              field.type = p2 || `text`;
              field.value = p3 || ``;
            }
            // console.log(field);
            snip.customFields.push(field);
          }
          return match;
      }
    });

    // console.log(snip);
    return snip;
  }

  sort({ by = 'seq', foldersOnTop = true, reverse = false, folderPath = ['all'] } = {}) {
    // recursive function in case everything needs to be sorted
    let sortFolder = (data, recursive, by, foldersOnTop, reverse) => {
      if (!data.children)
        return;
      data.children.sort((a, b) => {
        let result = a[by] > b[by];
        if (foldersOnTop)
          result = (a instanceof Folder)
                 ? ((b instanceof Folder) ? result : false)
                 : ((b instanceof Folder) ? true : result);
        if (reverse)
          result = !result;
        return result ? 1 : -1;
      });
      this.sequence(data);
      if (recursive) {
        for (let child of data.children) {
          if (child.children?.length)
            sortFolder(child, recursive, by, foldersOnTop, reverse);
        }
      }
    };
    if (folderPath[0] === 'all') {
      sortFolder(this.data, true, by, foldersOnTop, reverse);
    } else {
      sortFolder(this.getItem(folderPath), false, by, foldersOnTop, reverse);
    }
    return this;
  }

  sequence(folder) {
    if (folder.children) {
      let i = folder.children.length;
      while (i--) {
        folder.children[i].seq = i + 1;
      }
    }
    return this;
  }

  async shift({ name = this.name, synced = this.synced }) {
    // passthrough in case of no changes
    if (synced === this.synced && name === this.name) return true;
    // check if new space already exists
    const targetSpace = await getStorageData(name, synced);
    if (targetSpace[name]) {
      // confirm overwrite
      if (!confirm(i18n('warning_sync_overwrite'))) {
        return false;
      }
    }

    if (synced) {
      // check for sync size constraints
      const dataBucket = new DataBucket(this.data);
      await dataBucket.compress();
      if (!dataBucket.syncable(name)) {
        alert(i18n('error_sync_full'));
        return false;
      }
    }

    // save old space details
    const oldSpace = { name: this.name, synced: this.synced };

    // update current space details
    this.name = name, this.synced = synced;

    // attempt to move the space
    if (!await this.save()) return false;

    // delete old data if syncing
    if (synced) removeStorageData(oldSpace.name, oldSpace.synced);

    // let other instances know of shift
    // setStorageData({ shift: {
    //   oldSpace: oldSpace,
    //   newSpace: { name: name, synced: synced },
    // } }, true);

    return true;
  }

  /**
   * Reuse the space object
   * @param {{
   *   name: string
   *   synced: boolean
   *   data: DataBucket
   *   path: number[]|string
   * }} details
   */
  async init({ name, synced, data, path } = {}) {
    // check defaults if either name or synced are blank
    const settings = new Settings();
    if (!name || !synced) await settings.load();
    
    // make sure data is parsed correctly
    // console.log("Checking data integrity...", name, synced, data, path);
    if (!(data instanceof DataBucket)) {
      data = new DataBucket(data);
      // console.log("Parsing data...", data);
      if (!(await data.parse())) {
        // throw new Error(`Unable to parse data, cancelling initialization...\n${data}`);
        return;
      }
    }

    // make sure path is correct or reset otherwise
    if (typeof path === 'string') path = path.split('-').filter(v => !isNaN(v));
    if (!Array.isArray(path)) path = [];

    // update properties
    // console.log("Updating details...", name, synced, data, path);
    this.name = name || settings.defaultSpace.name;
    this.synced = (typeof synced === 'boolean') ? synced : settings.defaultSpace.synced;
    this.data = data;
    this.path = path;

    // console.log("Space initialized.", this);
    return true;
  }
}

/**
 * Settings object for persisting as window global
 */
class Settings {
  /**
   * @param {Settings} settings 
   */
  constructor(settings) {
    if (settings) this.init(settings);
  }

  /**
   * Take provided settings and initialize the remaining settings
   * @param {Settings} settings 
   */
  init({ defaultSpace, sort, view, control } = {}) {
    // console.log(defaultSpace, sort, view, control);
    /** @type {{name:string,synced:boolean}} */
    this.defaultSpace = {};
    this.defaultSpace.name = defaultSpace?.name || i18n('app_name');
    this.defaultSpace.synced = isBool(defaultSpace?.synced) ? defaultSpace.synced : true;
    /** @type {{by:string,groupBy:string,foldersOnTop:boolean}} */
    this.sort = {};
    this.sort.by = sort?.by || 'seq';
    this.sort.groupBy = sort?.groupBy || '';
    this.sort.foldersOnTop = isBool(sort?.foldersOnTop) ? sort.foldersOnTop : true;
    /** @type {{rememberPath:boolean,sourceURL:boolean}} */
    this.view = {};
    this.view.rememberPath = isBool(view?.rememberPath) ? view.rememberPath : false;
    this.view.sourceURL = isBool(view?.sourceURL) ? view.sourceURL : false;
    /** @type {{saveSource:boolean,preserveTags:boolean,rtLineBreaks:boolean,rtLinkEmails:boolean,rtLinkURLs:boolean}} */
    this.control = {};
    this.control.saveSource = isBool(control?.saveSource) ? control.saveSource : false;
    this.control.preserveTags = isBool(control?.preserveTags) ? control.preserveTags : false;
    this.control.rtLineBreaks = isBool(control?.rtLineBreaks) ? control.rtLineBreaks : true;
    this.control.rtLinkEmails = isBool(control?.rtLinkEmails) ? control.rtLinkEmails : true;
    this.control.rtLinkURLs = isBool(control?.rtLinkURLs) ? control.rtLinkURLs : true;
  }

  async load() {
    const { settings } = await getStorageData('settings', true);
    if (!settings) return settings; // return errors as-is

    // legacy check
    if (settings.foldersOnTop) {
      settings.sort = { foldersOnTop: settings.foldersOnTop };
      delete settings.foldersOnTop;
    }

    // upgrade settings object as needed and return the object
    this.init(settings);
    return this;
  }

  async save() {
    setStorageData({ settings: this }, true);
  }
}

/**
 * (Re)build context menu for snipping and pasting
 * @param {Space} space 
 */
async function buildContextMenus(space) {
  // console.log(structuredClone(space));
  // clear current
  await new Promise((resolve, reject) =>
    chrome.contextMenus.removeAll(() =>
      chrome.runtime.lastError
      ? reject(chrome.runtime.lastError)
      : resolve()));
  let menuData = {
    space: {
      name: space.name,
      synced: space.synced,
    },
    action: 'snip',
  };

  const addMenu = properties => new Promise((resolve, reject) =>
  chrome.contextMenus.create(properties, () =>
  chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(true)));

  // create snipper for selected text
  addMenu({
    "id": JSON.stringify(menuData),
    "title": i18n('action_snip_selection'),
    "contexts": ["selection"],
  });

  // build paster for saved snippets
  // console.log(space);
  if (space.data) {
    // set root menu item
    menuData.path = [];
    menuData.action = 'paste';
    chrome.contextMenus.create({
      "id": JSON.stringify(menuData),
      "title": i18n('action_paste'),
      "contexts": ["editable"],
    });

    /**
     * Recursive function for snippet tree
     * @param {(TreeItem|Folder|Snippet)[]} folder 
     * @param {*} parentData 
     */
    const buildFolder = async (folder, parentData) => {
      let menuItem = {
        "contexts": ["editable"],
        "parentId": JSON.stringify(parentData),
      };
      // clone parent object to avoid polluting it
      let menuData = structuredClone(parentData);
      if (folder.length) {
        folder.forEach(item => {
          menuData.path = parentData.path.concat([item.seq]) ?? [item.seq];
          menuItem.id = JSON.stringify(menuData);
          // using emojis for ease of parsing, && escaping, nbsp needed for chrome bug
          const color = colors[item.color];
          menuItem.title = ((item instanceof Folder)
                           ? (color?.square || "📁 ")
                           : (color?.circle || "📝 "))
                         + item.name.replaceAll("&", "&&")
                         + "\xA0\xA0\xA0\xA0"; // padding for nicer display
          chrome.contextMenus.create(menuItem);
          if (item instanceof Folder) buildFolder(item.children, menuData);
        });
      } else {
        menuData.path = parentData.path.concat(['empty']);
        menuItem.id = JSON.stringify(menuData);
        menuItem.title = i18n('folder_empty');
        menuItem.enabled = false;
        chrome.contextMenus.create(menuItem);
      }
    };
    // build paste snippet menu tree
    if (space.data.children) buildFolder(space.data.children, menuData);
  }
}

/**
 * Replaces html tags with markdown symbols
 * @param {string} text 
 * @returns {string}
 */
function mdify(text) {
  return text;
}

/**
 * Replaces markdown symbols with html tags
 * @param {string} text 
 * @returns {string}
 */
function parseMD(text) {
  return text;
}