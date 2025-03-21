import {actionCreators as ac, actionTypes as at} from "common/Actions.jsm";

const _OpenInPrivateWindow = site => ({
  id: "newtab-menu-open-new-private-window",
  icon: "new-window-private",
  action: ac.OnlyToMain({
    type: at.OPEN_PRIVATE_WINDOW,
    data: {url: site.url, referrer: site.referrer},
  }),
  userEvent: "OPEN_PRIVATE_WINDOW",
});

/**
 * List of functions that return items that can be included as menu options in a
 * LinkMenu. All functions take the site as the first parameter, and optionally
 * the index of the site.
 */
export const LinkMenuOptions = {
  Separator: () => ({type: "separator"}),
  EmptyItem: () => ({type: "empty"}),
  RemoveBookmark: site => ({
    id: "newtab-menu-remove-bookmark",
    icon: "bookmark-added",
    action: ac.AlsoToMain({
      type: at.DELETE_BOOKMARK_BY_ID,
      data: site.bookmarkGuid,
    }),
    userEvent: "BOOKMARK_DELETE",
  }),
  AddBookmark: site => ({
    id: "newtab-menu-bookmark",
    icon: "bookmark-hollow",
    action: ac.AlsoToMain({
      type: at.BOOKMARK_URL,
      data: {url: site.url, title: site.title, type: site.type},
    }),
    userEvent: "BOOKMARK_ADD",
  }),
  OpenInNewWindow: site => ({
    id: "newtab-menu-open-new-window",
    icon: "new-window",
    action: ac.AlsoToMain({
      type: at.OPEN_NEW_WINDOW,
      data: {
        referrer: site.referrer,
        typedBonus: site.typedBonus,
        url: site.url,
      },
    }),
    userEvent: "OPEN_NEW_WINDOW",
  }),
  BlockUrl: (site, index, eventSource) => ({
    id: "newtab-menu-dismiss",
    icon: "dismiss",
    action: ac.AlsoToMain({
      type: at.BLOCK_URL,
      data: {url: site.open_url || site.url},
    }),
    impression: ac.ImpressionStats({
      source: eventSource,
      block: 0,
      tiles: [{
        id: site.guid,
        pos: index,
        ...(site.shim && site.shim.delete ? {shim: site.shim.delete} : {}),
      }],
    }),
    userEvent: "BLOCK",
  }),

  // This is an option for web extentions which will result in remove items from
  // memory and notify the web extenion, rather than using the built-in block list.
  WebExtDismiss: (site, index, eventSource) => ({
    id: "menu_action_webext_dismiss",
    string_id: "newtab-menu-dismiss",
    icon: "dismiss",
    action: ac.WebExtEvent(at.WEBEXT_DISMISS, {
      source: eventSource,
      url: site.url,
      action_position: index,
    }),
  }),
  DeleteUrl: (site, index, eventSource, isEnabled, siteInfo) => ({
    id: "newtab-menu-delete-history",
    icon: "delete",
    action: {
      type: at.DIALOG_OPEN,
      data: {
        onConfirm: [
          ac.AlsoToMain({type: at.DELETE_HISTORY_URL, data: {url: site.url, forceBlock: site.bookmarkGuid}}),
          ac.UserEvent(Object.assign({event: "DELETE", source: eventSource, action_position: index}, siteInfo)),
        ],
        eventSource,
        body_string_id: ["newtab-confirm-delete-history-p1", "newtab-confirm-delete-history-p2"],
        confirm_button_string_id: "newtab-topsites-delete-history-button",
        cancel_button_string_id: "newtab-topsites-cancel-button",
        icon: "modal-delete",
      },
    },
    userEvent: "DIALOG_OPEN",
  }),
  ShowFile: site => ({
    id: "newtab-menu-show-file",
    icon: "search",
    action: ac.OnlyToMain({
      type: at.SHOW_DOWNLOAD_FILE,
      data: {url: site.url},
    }),
  }),
  OpenFile: site => ({
    id: "newtab-menu-open-file",
    icon: "open-file",
    action: ac.OnlyToMain({
      type: at.OPEN_DOWNLOAD_FILE,
      data: {url: site.url},
    }),
  }),
  CopyDownloadLink: site => ({
    id: "newtab-menu-copy-download-link",
    icon: "copy",
    action: ac.OnlyToMain({
      type: at.COPY_DOWNLOAD_LINK,
      data: {url: site.url},
    }),
  }),
  GoToDownloadPage: site => ({
    id: "newtab-menu-go-to-download-page",
    icon: "download",
    action: ac.OnlyToMain({
      type: at.OPEN_LINK,
      data: {url: site.referrer},
    }),
    disabled: !site.referrer,
  }),
  RemoveDownload: site => ({
    id: "newtab-menu-remove-download",
    icon: "delete",
    action: ac.OnlyToMain({
      type: at.REMOVE_DOWNLOAD_FILE,
      data: {url: site.url},
    }),
  }),
  PinTopSite: ({url, searchTopSite, label}, index) => ({
    id: "newtab-menu-pin",
    icon: "pin",
    action: ac.AlsoToMain({
      type: at.TOP_SITES_PIN,
      data: {
        site: {
          url,
          ...(searchTopSite && {searchTopSite, label}),
        },
        index,
      },
    }),
    userEvent: "PIN",
  }),
  UnpinTopSite: site => ({
    id: "newtab-menu-unpin",
    icon: "unpin",
    action: ac.AlsoToMain({
      type: at.TOP_SITES_UNPIN,
      data: {site: {url: site.url}},
    }),
    userEvent: "UNPIN",
  }),
  EditTopSite: (site, index) => ({
    id: "newtab-menu-edit-topsites",
    icon: "edit",
    action: {
      type: at.TOP_SITES_EDIT,
      data: {index},
    },
  }),
  CheckBookmark: site => (site.bookmarkGuid ? LinkMenuOptions.RemoveBookmark(site) : LinkMenuOptions.AddBookmark(site)),
  CheckPinTopSite: (site, index) => (site.isPinned ? LinkMenuOptions.UnpinTopSite(site) : LinkMenuOptions.PinTopSite(site, index)),
  OpenInPrivateWindow: (site, index, eventSource, isEnabled) => (isEnabled ? _OpenInPrivateWindow(site) : LinkMenuOptions.EmptyItem()),
};
