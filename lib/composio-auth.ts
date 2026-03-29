/**
 * Composio popup auth flow helper.
 * Opens a Composio auth link in a popup, polls for completion,
 * and resolves with the final URL params (e.g. { status: "success" }).
 *
 * Based on: .agents/skills/composio/rules/app-auth-popup-ui.md
 */

export const initiateComposioAuthFlow = (
  url: string,
  successParam: string = "status"
): Promise<Record<string, string>> => {
  const width = 600;
  const height = 840;
  const leftPosition = (window.innerWidth - width) / 2;
  const topPosition = (window.innerHeight - height) / 2;

  return new Promise((resolve, reject) => {
    const popup = window.open(
      url,
      "composio-auth-popup",
      `width=${width},height=${height},left=${leftPosition},top=${topPosition}`
    );

    if (!popup) {
      reject(new Error("Popup blocked by browser"));
      return;
    }

    popup.focus();

    const popupChecker = setInterval(() => {
      if (popup.closed) {
        clearInterval(popupChecker);
        reject(new Error("Popup closed before completion"));
        return;
      }

      let popupUrl: URL | null = null;
      try {
        popupUrl = new URL(popup.location.href);
      } catch {
        // Cross-origin while Composio page is open — ignore until redirect
      }

      if (!popupUrl) return;

      const successValue = popupUrl.searchParams.get(successParam);
      const errorValue = popupUrl.searchParams.get("error");

      if (errorValue) {
        clearInterval(popupChecker);
        popup.close();
        reject(new Error(String(errorValue)));
        return;
      }

      if (successValue !== null) {
        const allParams: Record<string, string> = {};
        popupUrl.searchParams.forEach((value, key) => {
          allParams[key] = value;
        });
        clearInterval(popupChecker);
        popup.close();
        resolve(allParams);
      }
    }, 500);
  });
};
