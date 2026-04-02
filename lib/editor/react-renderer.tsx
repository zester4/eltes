import { createRoot, type Root } from "react-dom/client";

// biome-ignore lint/complexity/noStaticOnlyClass: "Needs to be static"
export class ReactRenderer {
  static render(component: React.ReactElement, dom: HTMLElement & { __reactRoot?: Root }) {
    let root = dom.__reactRoot;
    
    if (!root) {
      root = createRoot(dom);
      dom.__reactRoot = root;
    }
    
    root.render(component);

    return {
      destroy: () => {
        root?.unmount();
        delete dom.__reactRoot;
      },
    };
  }
}
