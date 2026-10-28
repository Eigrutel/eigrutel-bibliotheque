/* One interface, one FR/EN dictionary. Only explicit UI strings are translated. */
const I18n = (() => {
  const catalog = __CATALOG__;
  const english = Object.fromEntries(
    Object.entries(catalog).map(([key, value]) => [key.trim(), value.trim()]),
  );
  const preferenceKey = "eigrutel-bibliotheque-language";
  let language = "fr";
  const bindings = [];
  try {
    if (localStorage.getItem(preferenceKey) === "en") language = "en";
  } catch {} // Language switching also works when browser storage is blocked.
  function t(value) {
    if (typeof value !== "string") return value ?? "";
    const key = value.trim();
    if (language !== "en" || !Object.hasOwn(english, key)) return value;
    return value.replace(key, () => english[key]);
  }
  // This function receives source-code literals, never assembled user content.
  function html(source) {
    return source
      .replace(/(^|>)([^<>]+)(?=<|$)/g, (_, prefix, value) => prefix + t(value))
      .replace(
        /(\b(?:aria-label|title|placeholder|alt)\s*=\s*")([^"]*)("|$)/g,
        (_, prefix, value, suffix) => prefix + t(value) + suffix,
      );
  }
  function refresh() {
    document.documentElement.lang = language;
    for (const binding of bindings) {
      if (!binding.node.isConnected) continue;
      if (binding.attribute)
        binding.node.setAttribute(binding.attribute, t(binding.source));
      else binding.node.nodeValue = t(binding.source);
    }
    const button = document.getElementById("language-switch");
    if (button) {
      button.textContent = language === "fr" ? "English" : "Français";
      button.lang = language === "fr" ? "en" : "fr";
      button.setAttribute(
        "aria-label",
        language === "fr" ? "Passer en anglais" : "Switch to French",
      );
    }
  }
  // Capture fixed markup before the app renders books, notes or user labels.
  function bindStatic() {
    const walker = document.createTreeWalker(
      document.documentElement,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest("script,style,textarea,noscript"))
        continue;
      if (Object.hasOwn(english, node.nodeValue.trim()))
        bindings.push({ node, source: node.nodeValue });
    }
    for (const node of document.querySelectorAll(
      "[aria-label],[title],[placeholder],[alt]",
    )) {
      for (const attribute of ["aria-label", "title", "placeholder", "alt"]) {
        const source = node.getAttribute(attribute);
        if (source && Object.hasOwn(english, source.trim()))
          bindings.push({ node, attribute, source });
      }
    }
    refresh();
  }
  function setLanguage(value) {
    if (!["fr", "en"].includes(value)) return;
    language = value;
    try {
      localStorage.setItem(preferenceKey, language);
    } catch {}
    refresh();
  }
  return {
    t,
    html,
    bindStatic,
    setLanguage,
    get language() {
      return language;
    },
    get locale() {
      return language === "en" ? "en-GB" : "fr-FR";
    },
  };
})();
I18n.bindStatic();
