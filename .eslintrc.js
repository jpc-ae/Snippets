module.exports = {
    "env": {
        "browser": true,
        "webextensions": true,
        "worker": true,
        "es2024": true,
    },
    "extends": "eslint:recommended",
    "overrides": [
        {
            "env": {
                "node": true,
            },
            "files": [
                ".eslintrc.{js,cjs}",
            ],
            "parserOptions": {
                "sourceType": "script",
            },
        },
    ],
    "parserOptions": {
        "ecmaVersion": "latest",
        "sourceType": "module",
    },
    "rules": {
        "semi": [1, "always"],
        "comma-dangle": [1, "always-multiline"],
    },
    "globals": {
        "getStorageData": false,
        "setStorageData": false,
        "removeStorageData": false,
        "injectScript": false,
        "getFullSelection": false,
        "placeText": false,
        "requestFrames": false,
        "getSnippet": false,
        "pasteSnippet": false,
        "TreeItem": false,
        "Folder": false,
        "Snippet": false,
        "DataBucket": false,
        "Space": false,
        "Settings": false,
        "i18n": false,
        "colors": false,
        "editorHeight": false,
        "buildContextMenus": false,
        "buildNode": false,
        "buildSvg": false,
        "setSvgSprite": false,
        "setSvgFill": false,
        "toggleChecked": false,
        "buildPopoverMenu": false,
        "buildMenuItem": false,
        "buildMenuControl": false,
        "buildMenuSeparator": false,
        "buildSubMenu": false,
        "buildActionIcon": false,
        "buildItemWidget": false,
        "buildTreeWidget": false,
        "buildModal": false,
    },
};
