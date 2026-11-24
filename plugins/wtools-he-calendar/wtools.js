"use strict";
// The upstream calendar consumes this small adapter rather than changing the
// immutable API objects injected by WTools. Browser preview uses local storage.
(() => {
  const api = window.wtools;
  let noticeTimer;
  const notify = (message) => {
    const notice = document.getElementById("notice");
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
  };
  const storage = api?.dbStorage ?? {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  };
  const openLink = async (url) => {
    try {
      if (api) {
        if (typeof api.shellOpenExternal !== "function") {
          notify("请升级到支持插件外链的 WTools 版本。");
          return;
        }
        await api.shellOpenExternal(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      notify(error.message || "无法打开链接。");
    }
  };
  const request = (url, options) => {
    if (api) {
      if (typeof api.request !== "function") {
        return Promise.reject(new Error("请升级到支持通用网络请求的 WTools 构建。"));
      }
      return api.request(url, options);
    }
    return fetch(url, options);
  };
  Object.defineProperty(window, "heCalendarHost", {
    value: Object.freeze({
      dbStorage: storage,
      onPluginEnter: (handler) => {
        if (api) api.onPluginEnter(handler);
        else queueMicrotask(() => handler({ code: "calendar", type: "text", payload: "" }));
      },
      onPluginOut: (handler) => {
        if (api) api.onPluginOut(handler);
        else window.addEventListener("pagehide", () => handler(false));
      },
      shellOpenExternal: openLink,
      request,
    }),
  });
})();
