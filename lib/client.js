/**
 * Sidebar view density - switch the session list between detail rows, icon sizes and grid columns.
 *
 * Two problems shaped this file:
 *
 * 1. Where the button lives. `sidebar.footer.action` renders *above* the account row, so a control
 *    placed there jumps around whenever the account menu opens. The DSH mobile plugin solved the
 *    same problem by rendering into that slot and then moving its own node into the account row
 *    (anchored at `[data-slot="settings.launcher"]`, the avatar outlet). We do the same: register
 *    in the slot so the plugin stays a normal slot participant, then relocate the node into the
 *    `dshm_footerGroup` box the mobile plugin already created (or create our own sibling box).
 *
 * 2. What the mode covers. The workspace list, the plugin sidebar and the plugin detail page are
 *    three unrelated DOM trees with their own stable `data-*` hooks, so every mode sets the same
 *    custom properties on all of them instead of styling one tree.
 */

window.__ModuleLoader__.load({
  id: 'dsh-sidebar-view-density',
  factory(require) {
    const React = require('react');
    const reactDomClient = require('react-dom/client');
    /*
     * createPortal lives on react-dom, not on react-dom/client: the client entry exports only
     * createRoot / hydrateRoot. Reading it off the client entry throws at render time
     * (reactDom.createPortal is not a function), which silently killed the sidebar trigger.
     */

    const reactDom = require('react-dom');
    const h = React.createElement;
    /* ------------------------------------------------------------------ copy */

    /**
     * Pick the copy language.
     *
     * `documentElement.lang` is the documented signal and is checked first, but this host does not
     * reliably keep it in sync with its own language setting - `main.js` stores the choice on
     * `environment.LANG` and translates through its locale service, leaving the document element
     * on whatever the static HTML declared. Reading `lang` alone therefore shipped English labels
     * into a Chinese UI.
     *
     * So the order is: an explicit `zh*` on the document wins; an explicit non-Chinese `lang` is
     * only trusted when the browser also reports a non-Chinese language; otherwise default to
     * Chinese, which is this app's primary locale.
     */
    const detectZh = (documentLanguage, browserLanguage) => {
      const tag = typeof documentLanguage === 'string' ? documentLanguage.toLowerCase() : '';
      if (tag.startsWith('zh')) return true;
      const first = Array.isArray(browserLanguage) ? browserLanguage[0] : browserLanguage;
      const browser = typeof first === 'string' ? first.toLowerCase() : '';
      // A document `lang` of `en` is not evidence of an English user when the browser itself is
      // Chinese: that combination is the host failing to sync, not a language choice.
      if (tag !== '' && !browser.startsWith('zh')) return false;
      return true;
    };

    const zh = detectZh(
      typeof document !== 'undefined' && document.documentElement ? document.documentElement.lang : '',
      typeof navigator !== 'undefined' ? navigator.languages || navigator.language : '',
    );

    const COPY = zh
      ? {
          label: '查看方式',
          hint: '查看方式',
          menuTitle: '查看方式',
          session: '会话列表',
          pluginsHint: '插件页查看方式',
          plugins: '插件页',
          panels: '面板',
          custom: '自定义',
          customCols: '列数',
          customRowGap: '上下间距',
          customColGap: '左右间距',
          customWidth: '每行高度',
          surfaceSession: '会话列表',
          surfacePanels: '面板',
          surfacePlugins: '插件页',
          customNote: '选「自定义」后以上数值生效，同时作用于会话列表、面板和插件页。',
          settingsTitle: '侧栏视图',
          settingsHint: '列数和间距只影响「自定义」查看方式。',
        }
      : {
          label: 'View',
          hint: 'View',
          menuTitle: 'View as',
          session: 'Sessions',
          pluginsHint: '插件页查看方式',
          plugins: 'Plugin page',
          panels: 'Panels',
          custom: 'Custom grid',
          customCols: 'Columns',
          customRowGap: 'Row gap',
          customColGap: 'Column gap',
          customWidth: 'Row height',
          surfaceSession: 'Sessions',
          surfacePanels: 'Panels',
          surfacePlugins: 'Plugin page',
          customNote: 'Applies when the view mode is Custom, on sessions, panels and the plugin page.',
          settingsTitle: 'Sidebar view',
          settingsHint: 'Columns and gaps apply to the Custom view mode only.',
        };

    /* ----------------------------------------------------------------- state */

    const MODES = ['detail', 'column1', 'column2', 'custom'];
    const MODE_LABEL = {
      detail: zh ? '详细列表' : 'Details',
      column1: zh ? '单列' : 'One column',
      column2: zh ? '双列' : 'Two columns',
      custom: zh ? '自定义' : 'Custom grid',
    };
    const STORAGE_KEY = 'dsh-sidebar-view-density';
    const PLUGIN_STORAGE_KEY = 'dsh-sidebar-view-density:plugins';
    const PANEL_STORAGE_KEY = 'dsh-sidebar-view-density:panels';
    /** The sidebar footer slot. Present so the trigger survives when the account row is gone. */
    const FOOTER_SLOT = 'sidebar.footer.action';
    const ATTR = 'data-dsh-view-density';
    const PLUGIN_ATTR = 'data-dsh-view-plugin-density';
    /*
     * The sidebar panel navigation (Purge / skills / memory / search / IG5 / more) is a third,
     * independent surface. It lives inside the sidebar but is neither the session list nor the
     * plugin page, so it gets its own attribute and its own remembered mode.
     */
    const PANEL_ATTR = 'data-dsh-view-panel-density';
    const STYLE_ID = 'dsh-sidebar-view-density-style';
    const BTN_MARK = 'data-dsh-view-density-button';

    const readStored = (key, fallback) => {
      try {
        const raw = window.localStorage.getItem(key);
        return MODES.includes(raw) ? raw : fallback;
      } catch {
        return fallback;
      }
    };

    const writeStored = (key, mode) => {
      try {
        window.localStorage.setItem(key, mode);
      } catch {
        /* private mode without storage: the mode still applies for this page */
      }
    };

    const subscribers = new Set();

    /**
     * Write the mode onto the root element rather than into a React tree.
     *
     * The workspace list and the plugin pages are separate React roots mounted by different
     * packages, and neither exposes a prop for row geometry. A root attribute lets one stylesheet
     * reach all of them, and it survives their re-renders because nothing re-renders it away.
     */
    const applyMode = (mode) => {
      if (typeof document === 'undefined' || !document) return;
      const root = document.documentElement;
      if (!root) return;
      if (mode === 'detail') root.removeAttribute(ATTR);
      else root.setAttribute(ATTR, mode);
    };

    const applyPluginMode = (mode) => {
      if (typeof document === 'undefined' || !document) return;
      const root = document.documentElement;
      if (!root) return;
      if (mode === 'detail') root.removeAttribute(PLUGIN_ATTR);
      else root.setAttribute(PLUGIN_ATTR, mode);
    };

    const applyPanelMode = (mode) => {
      if (typeof document === 'undefined' || !document) return;
      const root = document.documentElement;
      if (!root) return;
      if (mode === 'detail') root.removeAttribute(PANEL_ATTR);
      else root.setAttribute(PANEL_ATTR, mode);
    };

    /*
     * The custom mode is a grid whose column count and gaps are user numbers, not
     * one of the fixed geometry entries: it needs its own stored record and its own
     * root variables, so the stylesheet can read them without a second attribute.
     */
    const CUSTOM_KEY = 'dsh-sidebar-view-density:custom';

    /*
     * The custom grid is per surface, not global: a three-column tile layout suits the
     * plugin page, while the session list usually wants two narrower tracks. Each surface
     * keeps its own numbers and its own root-variable prefix, so a slider only ever
     * rewrites the surface whose trigger opened it.
     */
    const SURFACES = ['session', 'panels', 'plugins'];
    const SURFACE_LABEL = {
      session: () => COPY.surfaceSession,
      panels: () => COPY.surfacePanels,
      plugins: () => COPY.surfacePlugins,
    };
    const VAR_PREFIX = {
      session: '--dsh-view',
      panels: '--dsh-panel',
      plugins: '--dsh-plugin',
    };
    const DEFAULT_SURFACE = { cols: 2, rowGap: 6, colGap: 6, rowHeight: 44 };
    /*
     * The smallest row worth offering is one line of text, not an arbitrary round number:
     * the label is 13px at a 1.1 line-height, so anything under ~14px can only clip it.
     */
    const ROW_HEIGHT_MIN = 14;
    const clamp = (value, min, max, fallback) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      return Math.min(max, Math.max(min, Math.round(num)));
    };
    const readSurface = (source) => {
      const parsed = source && typeof source === 'object' ? source : {};
      return {
        cols: clamp(parsed.cols, 1, 6, DEFAULT_SURFACE.cols),
        rowGap: clamp(parsed.rowGap, 0, 24, DEFAULT_SURFACE.rowGap),
        colGap: clamp(parsed.colGap, 0, 24, DEFAULT_SURFACE.colGap),
        rowHeight: clamp(parsed.rowHeight, ROW_HEIGHT_MIN, 96, DEFAULT_SURFACE.rowHeight),
      };
    };
    const readCustom = () => {
      const out = {};
      let parsed = null;
      try {
        const raw = window.localStorage.getItem(CUSTOM_KEY);
        parsed = raw ? JSON.parse(raw) || {} : null;
      } catch {
        parsed = null;
      }
      for (const surface of SURFACES) {
        /*
         * The first build stored one flat record for every surface. Read it as the
         * initial value of each surface rather than dropping the user's numbers.
         */
        const hasPerSurface = parsed && parsed[surface] && typeof parsed[surface] === 'object';
        out[surface] = readSurface(hasPerSurface ? parsed[surface] : parsed);
      }
      return out;
    };

    let customConfig = readCustom();

    const applyCustom = () => {
      if (typeof document === 'undefined' || !document) return;
      const root = document.documentElement;
      if (!root || !root.style || typeof root.style.setProperty !== 'function') return;
      for (const surface of SURFACES) {
        const values = customConfig[surface];
        const prefix = VAR_PREFIX[surface];
        root.style.setProperty(prefix + '-cols', String(values.cols));
        root.style.setProperty(prefix + '-rowgap', values.rowGap + 'px');
        root.style.setProperty(prefix + '-colgap', values.colGap + 'px');
        root.style.setProperty(prefix + '-rowheight', values.rowHeight + 'px');
      }
    };

    const setCustom = (surface, patch) => {
      if (!SURFACES.includes(surface)) return;
      customConfig = Object.assign({}, customConfig, {
        [surface]: Object.assign({}, customConfig[surface], patch),
      });
      try {
        window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(customConfig));
      } catch {
        /* private mode without storage: the numbers still apply for this page */
      }
      applyCustom();
      emit();
    };

    let currentMode = readStored(STORAGE_KEY, 'detail');
    let currentPluginMode = readStored(PLUGIN_STORAGE_KEY, 'detail');
    let currentPanelMode = readStored(PANEL_STORAGE_KEY, 'detail');

    const emit = () => {
      for (const fn of subscribers) {
        try {
          fn();
        } catch {
          /* one broken listener must not stop the others */
        }
      }
    };

    const setMode = (mode) => {
      if (!MODES.includes(mode)) return;
      currentMode = mode;
      writeStored(STORAGE_KEY, mode);
      applyMode(mode);
      emit();
    };

    const setPluginMode = (mode) => {
      if (!MODES.includes(mode)) return;
      currentPluginMode = mode;
      writeStored(PLUGIN_STORAGE_KEY, mode);
      applyPluginMode(mode);
      emit();
    };

    const setPanelMode = (mode) => {
      if (!MODES.includes(mode)) return;
      currentPanelMode = mode;
      writeStored(PANEL_STORAGE_KEY, mode);
      applyPanelMode(mode);
      emit();
    };

    const useCustom = () => {
      const [, force] = React.useReducer((n) => n + 1, 0);
      React.useEffect(() => {
        subscribers.add(force);
        return () => subscribers.delete(force);
      }, []);
      return customConfig;
    };

    const useMode = () => {
      const [, force] = React.useReducer((n) => n + 1, 0);
      React.useEffect(() => {
        subscribers.add(force);
        return () => subscribers.delete(force);
      }, []);
      return currentMode;
    };

    const usePluginMode = () => {
      const [, force] = React.useReducer((n) => n + 1, 0);
      React.useEffect(() => {
        subscribers.add(force);
        return () => subscribers.delete(force);
      }, []);
      return currentPluginMode;
    };

    const usePanelMode = () => {
      const [, force] = React.useReducer((n) => n + 1, 0);
      React.useEffect(() => {
        subscribers.add(force);
        return () => subscribers.delete(force);
      }, []);
      return currentPanelMode;
    };

    /* ------------------------------------------------------------------- css */

    /*
     * Every scope below is keyed on a `data-*` hook the host itself writes, never on a CSS-module
     * hash: those hashes change between builds, and a stylesheet that matches on them silently
     * stops working after an upgrade.
     *
     * The `tree` of a scope is where the two-column grid is applied, so it has to be the element
     * that *directly holds the rows* - not an outer wrapper. The plugin detail page marks its
     * `<section data-plugin-rows>` but the rows live in a `<ul>` one level down, so the tree is
     * that inner list; a grid on the section would only column-ise the heading and the list.
     *
     * Scopes:
     *   [data-sidebar-list-area]  workspace session list
     *   [data-plugin-rows] > ul   plugin detail page row list
     *   [data-plugin-entry]       plugin sidebar entries
     *   [data-market-entry]       market cards
     *
     * `tree` must be written absolutely - rooted at its own hook - because the two-column rule
     * anchors it directly instead of crossing it with `scope`. A `tree` that relies on an ancestor
     * (`[data-plugin-tab] ul`) has to spell that ancestor out; otherwise the rule would match every
     * `ul` on the page.
     */
    const SCOPES = {
      session: {
        scope: '[data-sidebar-list-area]',
        row: '[data-row-key^="session:"]',
        tree: '[data-sidebar-list-area] [role="tree"]',
      },
      /*
       * The plugin page's own trees. These are matched only while the plugin attribute is set, so
       * the sidebar's plugin group and the plugin page never drive each other.
       *
       * `cards` is the page layout proper: the installed cards are bare `<li>` children of each
       * group's `<ul class="cards">` with no hook of their own, so the list is the scope and
       * `:scope > li` is the row.
       */
      pluginPage: {
        scope: '[data-plugin-scope], [data-plugin-tab], [data-plugin-rows]',
        row: '[data-plugin-row], [data-plugin-entry], [data-market-entry]',
        tree: '[data-plugin-rows] > ul, [data-plugin-scope] > ul, [data-plugin-tab] ul',
      },
      cards: {
        scope: '[data-plugin-scope], [data-plugin-tab], [data-plugin-rows]',
        row: ':scope > li',
        tree: '[data-plugin-scope] > ul, [data-plugin-tab] ul, [data-plugin-rows] > ul',
      },
    };

    /** Row geometry per mode. `detail` is the host's own default and stays untouched. */
    const GEOMETRY = {
      detail: { row: '32px', icon: '16px', font: '14px', gap: '2px' },
      column1: { row: '44px', icon: '18px', font: '14px', gap: '6px' },
      column2: { row: '44px', icon: '18px', font: '13px', gap: '6px' },
      custom: { row: '44px', icon: '18px', font: '13px', gap: '6px' },
    };

    /**
     * Cross a prefix with two selector lists, so a scope that matches several trees stays correct.
     *
     * `scopes` and `rows` may each hold comma-separated lists, and the naive interpolation yields
     * `html[x] A, B row` - only the first branch keeps its prefix and the later ones match the
     * whole page. Every pair has to be expanded, and so does anything appended after the pair:
     * a suffix pasted onto a joined list only lands on its last member.
     *
     * `scopes` may be empty for selectors that are already anchored (see `anchor`).
     */
    const cross = (prefix, scopes, rows, suffix = '') => {
      const out = [];
      const scopeList = scopes
        ? scopes.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      for (const scope of scopeList.length > 0 ? scopeList : ['']) {
        for (const row of rows.split(',').map((s) => s.trim()).filter(Boolean)) {
          out.push(`${prefix}${scope ? ` ${scope}` : ''} ${row}${suffix}`);
        }
      }
      return out.join(', ');
    };

    /**
     * Anchor a selector that is already rooted at a hook, e.g. `[data-plugin-rows] > ul`.
     *
     * A scope and its tree sometimes live on the same hook (`[data-plugin-rows]`, and the `ul`
     * right inside it). Interpolating both would emit `[data-plugin-rows] [data-plugin-rows] > ul`
     * - a node cannot be its own descendant, so the rule never matches. Every selector that starts
     * at a hook goes through here instead: each comma branch gets exactly one `html[...]` prefix.
     */
    const anchor = (prefix, selectors, suffix = '') => {
      const out = [];
      for (const sel of selectors.split(',').map((s) => s.trim()).filter(Boolean)) {
        const lead = /^[>+~]/.test(sel) ? ' ' : ' ';
        out.push(`${prefix}${lead}${sel}${suffix}`);
      }
      return out.join(', ');
    };

    /**
     * Build the rule set for one scope.
     *
     * `attr` is the root attribute that arms the mode. The declarations are identical across
     * trees, which is the point: one mode, one set of numbers, every list on the page.
     */
    const buildRules = (attr, scopes, prefix) => {
      const lines = [];
      const geometry = (mode) => {
        const g = GEOMETRY[mode];
        return [
          `--dsh-view-row-height:${g.row}`,
          `--dsh-view-icon:${g.icon}`,
          `--dsh-view-font:${g.font}`,
          `--dsh-view-gap:${g.gap}`,
        ].join(';');
      };

      for (const key of Object.keys(scopes)) {
        const { scope, row, tree } = scopes[key];

        /*
         * Two kinds of rows live under these trees. Most carry a hook of their own (`session:`,
         * `[data-plugin-row]`) and are laid out by the host as a flex row: those take the
         * row-height / icon / font treatment below. The installed plugin cards are bare
         * `<li>` children of a group's `<ul>`, matched as `:scope > li`: the `<li>` *is* the whole
         * card, so cropping it to a row height would cut its two-line head. They get their
         * geometry from the card block further down instead.
         */
        const bare = row.includes(':scope > li');

        for (const mode of MODES) {
          if (mode === 'detail') continue;
          lines.push(`${cross(`html[${attr}="${mode}"]`, scope, row)}{${geometry(mode)}}`);
        }

        if (!bare) {
          // Row geometry. Only armed modes get it, so `detail` keeps the host's own numbers.
          lines.push(`${cross(`html[${attr}]`, scope, row)}{height:var(--dsh-view-row-height)}`);
          lines.push(`${cross(`html[${attr}]`, scope, row, ' > *:first-child')}{width:var(--dsh-view-icon);min-width:var(--dsh-view-icon);height:var(--dsh-view-icon)}`);
          lines.push(`${cross(`html[${attr}]`, scope, row, ' > *:first-child > *')}{width:var(--dsh-view-icon);height:var(--dsh-view-icon)}`);
          lines.push(`${cross(`html[${attr}]`, scope, row, ' > *:nth-child(2)')}{font-size:var(--dsh-view-font)}`);
        }

        // The stock list gets its 2px gap from a sibling rule; every mode replaces it. `tree` is
        // already rooted at a hook, so it is anchored rather than crossed with `scope`.
        lines.push(`${anchor(`html[${attr}]`, tree, ' > * + *')}{margin-top:var(--dsh-view-gap,2px)}`);

        // Card modes: give rows a surface so a dense list still reads as tiles.
        for (const mode of ['column1', 'column2']) {
          const sel = cross(`html[${attr}="${mode}"]`, scope, row);
          if (bare) {
            /*
             * A whole card keeps its own surface and outline; what it must not keep is the host's
             * `margin:0 -8px` hover bleed, which would push it past the pane once grid tracks are
             * full width. Reset the margin here so both the one- and two-column layouts stay
             * inside their container.
             */
            lines.push(`${sel}{min-width:0;margin-inline:0;box-sizing:border-box}`);
          } else {
            lines.push(`${sel}{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,0.06));padding-inline:8px;min-width:0}`);
            lines.push(`${cross(`html[${attr}="${mode}"]`, scope, row, ':hover')}{background:var(--dsw-alias-bg-layer-3,rgba(127,127,127,0.12))}`);
          }
        }

        // Grid layouts: two fixed tracks, or the custom column count. `align-content:start`
        // keeps a short list bunched at the top instead of spreading to fill the pane.
        for (const mode of ['column2', 'custom']) {
          /*
           * `custom` reads the numbers of *this* surface only: the prefix is chosen by the
           * caller, so the session list, the panel column and the plugin page each keep
           * their own track count, gaps and tile width.
           */
          const gridCols = mode === 'custom' ? `var(${prefix}-cols,2)` : '2';
          const gridGap = mode === 'custom'
            ? `var(${prefix}-rowgap,4px) var(${prefix}-colgap,4px)`
            : '4px';
          const gridSel = anchor(`html[${attr}="${mode}"]`, tree);
          const autoRows = mode === 'custom' ? 'auto' : `minmax(var(${prefix}-rowheight,44px),auto)`;
          lines.push(`${gridSel}{display:grid !important;grid-template-columns:repeat(${gridCols},minmax(0,1fr));grid-auto-rows:${autoRows};gap:${gridGap};align-content:start;width:100%;max-width:100%;min-width:0;box-sizing:border-box}`);
          /*
           * Every tile is at least the configured row height and grows if its label wraps.
           * The number is vertical: it sets how tall one list row is, not how wide a tile is.
           */
          if (mode !== 'custom') {
            lines.push(`${anchor(`html[${attr}="${mode}"]`, tree, ' > *')}{min-height:var(${prefix}-rowheight,44px);box-sizing:border-box}`);
          }
        }
        /*
         * In custom mode the slider is authoritative, not a floor. Left as a floor, the host's
         * own metrics win below roughly 24px: `.slot` is 20px tall, `.title` has a 20px
         * line-height, and a 16px icon plus its margins already exceeds a 12px row, so the
         * track silently stops shrinking. Here the track height is exact, the tile clips, and
         * the icon and label scale with the number - which is what a height control has to do.
         */
        if (!bare) {
          const customSel = `html[${attr}="custom"]`;
          const rh = `var(${prefix}-rowheight,44px)`;
          const glyph = `min(var(--dsh-view-icon,18px),calc(${rh} - 4px))`;
          /*
           * Only the row hook is cropped. The tree's other children are workspace and section
           * headers: giving them a 50px track pushed them out of the sidebar's own height and
           * clipped the sessions underneath, which is what an oversized group head looks like.
           */
          lines.push(`${cross(customSel, scope, row)}{height:${rh};min-height:0;max-height:${rh};overflow:hidden}`);
          lines.push(`${cross(customSel, scope, row, ' > *')}{min-height:0;max-height:${rh}}`);
          lines.push(`${cross(customSel, scope, row, ' > *:first-child')}{width:${glyph};min-width:0;height:${glyph};flex:none}`);
          lines.push(`${cross(customSel, scope, row, ' > *:first-child > *')}{width:${glyph};height:${glyph}}`);
          lines.push(`${cross(customSel, scope, row, ' > *:nth-child(2)')}{font-size:var(--dsh-view-font,13px);line-height:1.1;max-height:${rh};overflow:hidden}`);
        }

        /*
         * Inside a grid track the host's own card metrics overflow: `.card` carries
         * `margin:0 -8px` so its hover surface reaches past the page gutter, and in a track that
         * is already the full column width the negative margin pushes the content out of the pane.
         * The row also keeps its `padding`, which `content-box` would add on top of the track.
         * Both are neutralised here, per tree, so the two-track layout stays inside its container.
         */
        for (const mode of ['column2', 'custom']) {
          lines.push(`${anchor(`html[${attr}="${mode}"]`, tree, ' > *')}{margin:0;min-width:0;box-sizing:border-box}`);
          lines.push(`${anchor(`html[${attr}="${mode}"]`, tree, ' > * + *')}{margin-top:0;margin-inline:0}`);
          lines.push(`${anchor(`html[${attr}="${mode}"]`, tree, ' > * > *')}{min-width:0}`);
          lines.push(`${anchor(`html[${attr}="${mode}"]`, tree, ' > *')}{max-width:100%;overflow-wrap:anywhere}`);
          if (!bare) {
            /*
             * A grid track is roughly half the pane, so a single-line label either gets
             * ellipsised to nothing or is cut mid-word. Let the row grow and the label wrap
             * onto a second line instead: the timestamp column is dropped to make room.
             */
            /*
             * `custom` already pinned an exact height above; letting `auto` back in here would
             * undo it, beause the host's intrinsic row height is taller than the slider allows.
             */
            if (mode !== 'custom') {
              lines.push(`${cross(`html[${attr}="${mode}"]`, scope, row)}{height:auto;min-height:var(--dsh-view-row-height,44px)}`);
            }
            lines.push(`${cross(`html[${attr}="${mode}"]`, scope, row, ' > *:nth-child(2)')}{white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.24;display:block;min-width:0;max-height:2.6em;overflow:hidden}`);
            lines.push(`${cross(`html[${attr}="${mode}"]`, scope, row, ' > *:nth-child(3)')}{display:none}`);
          }
        }
      }
      return lines.join('\n');
    };

    const CSS = [
      /*
       * The sidebar attribute drives exactly one tree: the session list. Everything the menu calls
       * "plugins" is the plugin page in the main column, which has its own attribute and its own
       * trigger: the two must never move each other.
       */
      buildRules(ATTR, {
        session: SCOPES.session,
      }, VAR_PREFIX.session),
      buildRules(PLUGIN_ATTR, {
        pluginDetail: { scope: '[data-plugin-rows]', row: '[data-plugin-row]', tree: '[data-plugin-rows] > ul' },
        pluginInventory: { scope: '[data-plugin-scope]', row: '[data-plugin-entry]', tree: '[data-plugin-scope] > ul' },
        market: { scope: '[data-plugin-tab]', row: '[data-market-entry]', tree: '[data-plugin-tab] ul' },
        pluginCards: SCOPES.cards,
      }, VAR_PREFIX.plugins),
      /*
       * Hard containment. Two-column mode is the only layout that has ever pushed the plugin
       * page past its own right edge, and the cause is always a host card metric (its 8px hover
       * bleed, a nowrap label in the card head) escaping a grid track. Rather than chase every
       * metric the host may add next release, the page panel clips horizontally while the mode is
       * active: the page already scrolls vertically, so clipping x costs nothing but guarantees
       * the two-track grid stays inside the pane.
       */
      `html[${PLUGIN_ATTR}="column2"] [data-plugin-panel]{overflow-x:clip}`,
      `html[${PLUGIN_ATTR}="column2"] [data-plugin-body]{max-width:100%;box-sizing:border-box}`,
      `html[${PLUGIN_ATTR}="custom"] [data-plugin-panel]{overflow-x:clip}`,
      `html[${PLUGIN_ATTR}="custom"] [data-plugin-body]{max-width:100%;box-sizing:border-box}`,
      /*
       * The trigger sits in the account row next to the phone/computer icons, so it borrows their
       * metrics instead of inventing its own: 28x28, transparent, same hover surface. Anything
       * larger would push the row taller and misalign the avatar.
       */
      /*
       * Sidebar panel navigation (Purge / skills / memory / search / IG5 / more). Its rows are
       * `div.panelEntry` wrappers around a single button, so the session-list treatment - crop the
       * first child to an icon box - would squash the label. Only the wrapper height, the button
       * fill and the leading glyph are touched.
       *
       * The host writes no data hook on this list, so the selectors match the CSS-module class
       * through its hash prefix (`nav[class*="panelList"]`): the hash changes between builds, the
       * suffix does not.
       */
      ...(() => {
        const tree = 'nav[class*="panelList"]';
        const rows = 'nav[class*="panelList"] > [class*="panelEntry"]';
        const out = [];
        for (const mode of MODES) {
          if (mode === 'detail') continue;
          const g = GEOMETRY[mode];
          out.push(`html[${PANEL_ATTR}="${mode}"] ${rows}{--dsh-view-row-height:${g.row};--dsh-view-icon:${g.icon};--dsh-view-font:${g.font};--dsh-view-gap:${g.gap}}`);
        }
        out.push(`html[${PANEL_ATTR}] ${rows}{height:var(--dsh-view-row-height,32px)}`);
        out.push(`html[${PANEL_ATTR}] ${rows} > button{height:100%;font-size:var(--dsh-view-font,14px)}`);
        out.push(`html[${PANEL_ATTR}] ${rows} > button > span:first-child{width:var(--dsh-view-icon);height:var(--dsh-view-icon)}`);
        out.push(`html[${PANEL_ATTR}] ${rows} + [class*="panelEntry"]{margin-top:var(--dsh-view-gap,2px)}`);
        const panelVars = VAR_PREFIX.panels;
        for (const mode of ['column2', 'custom']) {
          const gridCols = mode === 'custom' ? `var(${panelVars}-cols,2)` : '2';
          const gridGap = mode === 'custom'
            ? `var(${panelVars}-rowgap,4px) var(${panelVars}-colgap,4px)`
            : '4px';
          out.push(`html[${PANEL_ATTR}="${mode}"] ${tree}{display:grid !important;grid-template-columns:repeat(${gridCols},minmax(0,1fr));grid-auto-rows:minmax(var(${panelVars}-rowheight,44px),auto);gap:${gridGap};align-content:start}`);
          out.push(`html[${PANEL_ATTR}="${mode}"] ${rows}{margin:0;min-width:0;box-sizing:border-box;min-height:var(${panelVars}-rowheight,44px)}`);
        }
        /*
         * `.panelRow` carries `min-height:32px;padding:5px` in the host stylesheet, so the panel
         * column ignored every value under 32 no matter what the slider said. Reset both here and
         * let the exact track height drive the row instead.
         */
        {
          const prh = `var(${panelVars}-rowheight,44px)`;
          const pglyph = `min(var(--dsh-view-icon,18px),calc(${prh} - 4px))`;
          out.push(`html[${PANEL_ATTR}="custom"] ${rows}{height:${prh};min-height:0;max-height:${prh};overflow:hidden;box-sizing:border-box}`);
          out.push(`html[${PANEL_ATTR}="custom"] ${rows} > button{height:100%;min-height:0 !important;padding-top:0;padding-bottom:0;overflow:hidden;box-sizing:border-box}`);
          out.push(`html[${PANEL_ATTR}="custom"] ${rows} > button > span:first-child{width:${pglyph};height:${pglyph};flex:none}`);
          out.push(`html[${PANEL_ATTR}="custom"] ${rows} > button > span:first-child > *{width:${pglyph};height:${pglyph}}`);
        }
        return out;
      })(),
      /*
      `[${BTN_MARK}]{flex:none;width:28px;height:28px;margin:0 2px;padding:0;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}`,
      `[${BTN_MARK}]:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}`,
      `[${BTN_MARK}]:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}`,
      `[${BTN_MARK}][data-dsh-view-rail]{width:36px;height:36px;margin:2px 0;border-radius:var(--dsw-radius-md)}`,
      /* The plugin-page trigger lives in a flex toolbar next to the refresh and add-plugin buttons; keep it from stretching. */
      `[data-dsh-view-density-plugin-host]{display:inline-flex;flex:none;align-items:center;margin-inline-end:8px}`,
      /*
       * The panel opens upward and anchors to the button's right edge: the trigger now lives at the
       * very bottom-right of the sidebar, so a downward panel would run off the window and a
       * left-anchored one would be clipped by the sidebar's own overflow. `min-width` is sized for
       * the longest label; `max-height` + scroll keeps twelve rows usable on a short window.
       */
      `.dsh-view-density-menu{position:absolute;bottom:calc(100% + 6px);right:0;z-index:60;min-width:212px;max-width:280px;max-height:calc(100vh - 96px);overflow-y:auto;overscroll-behavior:contain;user-select:none;-webkit-user-select:none;padding:4px;border-radius:var(--dsw-radius-md);border:1px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-bg-base,Canvas);box-shadow:0 8px 24px rgba(0,0,0,0.24);font-size:13px}`,
      `.dsh-view-density-menu.dsh-view-density-menu--rail{right:auto;left:0}`,
      `.dsh-view-density-menu-label{padding:2px 8px 4px;font-size:11px;opacity:0.65;cursor:default;white-space:nowrap}`,
      `.dsh-view-density-menu-rule{height:1px;margin:4px 6px;background:var(--dsw-alias-settings-card-stroke)}`,
      `.dsh-view-density-item{display:flex;align-items:center;gap:8px;width:100%;padding:5px 8px;user-select:none;-webkit-user-select:none;border:none;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;white-space:nowrap}`,
      `.dsh-view-density-item:hover{background:var(--dsw-alias-interactive-bg-hover)}`,
      `.dsh-view-density-item[aria-checked="true"]{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,0.14))}`,
      `.dsh-view-density-item span{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis}`,
      '.dsh-view-density-item.dsh-view-density-item--active{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,0.14))}',
      '.dsh-view-density-slider{display:flex;align-items:center;gap:8px;padding:5px 8px;font-size:12px;cursor:pointer;user-select:none;-webkit-user-select:none}',
      '.dsh-view-density-slider > span:first-child{flex:0 0 auto;opacity:0.7;white-space:nowrap}',
      '.dsh-view-density-slider input[type="range"]{flex:1 1 auto;min-width:92px;height:16px;margin:0;accent-color:var(--dsw-alias-state-business-primary,#4c8dff);cursor:pointer}',
      '.dsh-view-density-slider-value{flex:0 0 auto;font-variant-numeric:tabular-nums;opacity:0.85}',
    ].join('\n');

    const injectStyle = () => {
      if (typeof document === 'undefined' || !document) return;
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    };

    /* ---------------------------------------------------------------- glyphs */

    const ICON_PATHS = {
      detail: ['M2 4h12', 'M2 8h12', 'M2 12h12'],
      column1: ['M2 4h12v3.5H2z', 'M2 9.5h12v3.5H2z'],
      column2: ['M2 4h5.5v8H2z', 'M8.5 4H14v8H8.5z'],
      custom: ['M2 4h3v8H2z', 'M6.5 4h3v8h-3z', 'M11 4h3v8h-3z'],
    };

    const glyph = (mode) =>
      h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 16,
          height: 16,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { flex: 'none' },
        },
        ICON_PATHS[mode].map((d) => h('path', { key: d, d })),
      );

    const viewGlyph = () =>
      h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 16,
          height: 16,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
        },
        h('rect', { key: 'r', x: 2, y: 2.5, width: 12, height: 11, rx: 1.6 }),
        h('path', { key: 'a', d: 'M2 6h12' }),
        h('path', { key: 'b', d: 'M6.5 6v7.5' }),
      );

    const checkGlyph = () =>
      h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 14,
          height: 14,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { flex: 'none' },
        },
        h('path', { d: 'M3 8.5l3.2 3.2L13 5' }),
      );

    /* -------------------------------------------------------------- settings */

    /*
     * The custom grid is described by three numbers, so it needs somewhere to edit
     * them: a settings section with one slider per number, rather than a menu full of
     * presets. The section writes straight into the same stored record the menu reads,
     * and every slider re-applies the root variables immediately.
     */
    function ViewDensitySettings() {
      const config = useCustom();
      const slider = (key, surface, field, min, max, step, label, format) =>
        h(
          'label',
          {
            key,
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '4px 0',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            },
          },
          h('span', { style: { flex: '0 0 96px', fontSize: 13, opacity: 0.8 } }, label),
          h('input', {
            type: 'range',
            min,
            max,
            step,
            value: config[surface][field],
            'aria-label': SURFACE_LABEL[surface]() + ' ' + label,
            onChange: (event) => setCustom(surface, { [field]: Number(event.target.value) }),
            style: { flex: '1 1 auto', minWidth: 120 },
          }),
          h(
            'span',
            {
              style: {
                flex: '0 0 52px',
                textAlign: 'right',
                fontSize: 13,
                fontVariantNumeric: 'tabular-nums',
              },
            },
            format(config[surface][field]),
          ),
        );

      /*
       * One block per surface, because the numbers are per surface: a layout that suits the
       * plugin page is rarely the one the session list wants. Each block edits only its own
       * record, so the three grids stay independent.
       */
      const group = (surface) =>
        h(
          'div',
          { key: surface, style: { display: 'flex', flexDirection: 'column', gap: 0, paddingTop: 6 } },
          h('h4', { style: { margin: 0, fontSize: 13, fontWeight: 600, opacity: 0.9 } }, SURFACE_LABEL[surface]()),
          slider(surface + '-cols', surface, 'cols', 1, 6, 1, COPY.customCols, (v) => String(v)),
          slider(surface + '-rowHeight', surface, 'rowHeight', ROW_HEIGHT_MIN, 96, 1, COPY.customWidth, (v) => v + 'px'),
          slider(surface + '-rowGap', surface, 'rowGap', 0, 24, 1, COPY.customRowGap, (v) => v + 'px'),
          slider(surface + '-colGap', surface, 'colGap', 0, 24, 1, COPY.customColGap, (v) => v + 'px'),
        );

      return h(
        'section',
        { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
        h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600 } }, COPY.settingsTitle),
        h('p', { style: { margin: 0, fontSize: 12, opacity: 0.65 } }, COPY.settingsHint),
        SURFACES.map(group),
        h('p', { style: { margin: '4px 0 0', fontSize: 12, opacity: 0.55 } }, COPY.customNote),
      );
    }

    /* --------------------------------------------------------------- control */

    function ViewDensityButton({ variant }) {
      const isPlugin = variant === 'plugin';
      const mode = useMode();
      const pluginMode = usePluginMode();
      const panelMode = usePanelMode();
      const custom = useCustom();
      const active = isPlugin ? pluginMode : mode;
      const pick = isPlugin ? setPluginMode : setMode;
      const [open, setOpen] = React.useState(false);
      const [hover, setHover] = React.useState(false);
      const wrap = React.useRef(null);
      // The plugin-page panel is portalled to the body, so it is not a descendant of the
      // trigger. Without its own ref every pointerdown inside the panel counts as an outside
      // click, closes the panel in the capture phase, and the option never receives its click.
      const menuRef = React.useRef(null);
      // In the collapsed rail the account row is not rendered at all, so the trigger has to render
      // inline there. Everywhere else it is portalled into the account row, next to the phone and
      // computer icons, but as their sibling, never inside their box.
      /*
       * The account row is rebuilt by the host on every state change, and the plugin page toolbar
       * with it. A document-wide observer, coalesced into one rAF and seeded with a time bucket,
       * re-attaches both triggers when the row is replaced - without a per-mutation setState,
       * which would re-render this component on every DOM change in the whole app.
       */
      const [ticket, setTicket] = React.useState(0);
      React.useEffect(() => {
        const Observer = typeof window !== 'undefined' ? window.MutationObserver : undefined;
        if (typeof Observer !== 'function' || !document.body) return undefined;
        let frame = 0;
        const observer = new Observer(() => {
          if (frame !== 0) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            const wanted = Date.now();
            setTicket((value) => (Math.abs(value - wanted) < 40 ? value : wanted));
          });
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
          observer.disconnect();
          if (frame !== 0) cancelAnimationFrame(frame);
        };
      }, []);
      const rail = !isPlugin && footerRow() === null;
      React.useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          const inTrigger = wrap.current ? wrap.current.contains(event.target) : false;
          const inMenu = menuRef.current ? menuRef.current.contains(event.target) : false;
          if (!inTrigger && !inMenu) setOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown, true);
        };
      }, [open]);

      /*
       * The column count is a number, not a preset: it gets a slider in place of a
       * "custom" menu entry, and dragging it both switches that surface to the custom
       * mode and rewrites the track count live.
       */
      const sliderRow = (key, surface, field, min, max, step, label, format, pick, currentValue) =>
        h(
          'label',
          {
            key,
            className: currentValue === 'custom'
              ? 'dsh-view-density-slider dsh-view-density-item--active'
              : 'dsh-view-density-slider',
          },
          h('span', null, label),
          h('input', {
            type: 'range',
            min,
            max,
            step,
            value: custom[surface][field],
            'aria-label': label,
            onChange: (event) => {
              setCustom(surface, { [field]: Number(event.target.value) });
              if (currentValue !== 'custom') pick('custom');
            },
          }),
          h('span', { className: 'dsh-view-density-slider-value' }, format(custom[surface][field])),
        );

      const colsSlider = (key, surface, pick, currentValue) =>
        sliderRow(key, surface, 'cols', 1, 6, 1, COPY.customCols, (v) => String(v), pick, currentValue);

      const heightSlider = (key, surface, pick, currentValue) =>
        sliderRow(key, surface, 'rowHeight', ROW_HEIGHT_MIN, 96, 1, COPY.customWidth, (v) => v + 'px', pick, currentValue);

      const row = (label, id, checked, pick) =>
        h(
          'button',
          {
            key: label + id,
            type: 'button',
            role: 'menuitemradio',
            'aria-checked': checked,
            className: 'dsh-view-density-item',
            onClick: () => {
              pick(id);
              setOpen(false);
            },
          },
          glyph(id),
          h('span', null, MODE_LABEL[id]),
          checked ? checkGlyph() : null,
        );

      /*
       * The plugin page panel is placed against the viewport, not against its trigger.
       *
       * The page panel clips horizontally while two-column mode is active, and the toolbar sits at
       * the very top of that panel, so a panel positioned relative to the trigger either gets cut by
       * the clip or runs off the window edge. A fixed position measured from the trigger's own rect
       * escapes both: fixed boxes are laid out against the viewport, not the clipping ancestor.
       */
      const [anchorRect, setAnchorRect] = React.useState(null);
      React.useEffect(() => {
        if (!open || !isPlugin) return undefined;
        const measure = () => {
          const el = wrap.current;
          if (!el) return;
          const r = el.getBoundingClientRect();
          const width = 224;
          const left = Math.max(8, Math.min(r.left, (window.innerWidth || 1024) - width - 8));
          setAnchorRect({ top: r.bottom + 6, left });
        };
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
          window.removeEventListener('resize', measure);
          window.removeEventListener('scroll', measure, true);
        };
      }, [open, isPlugin]);

      const menu = open
        ? h(
            'div',
            {
              // `--rail` mirrors the button's own rail variant: in the collapsed rail the trigger
              // sits at the left edge, so the panel must grow rightward instead of leftward.
              className: rail ? 'dsh-view-density-menu dsh-view-density-menu--rail' : 'dsh-view-density-menu',
              role: 'menu',
              'aria-label': COPY.menuTitle,
              ref: menuRef,
              style: isPlugin && anchorRect ? { position: 'fixed', top: anchorRect.top, left: anchorRect.left, right: 'auto', bottom: 'auto', minWidth: 224, maxHeight: 'calc(100vh - ' + (anchorRect.top + 12) + 'px)' } : undefined,
            },
            /*
             * Two groups on the sidebar trigger, one group on the plugin page trigger.
             *
             * The session group sizes the workspace sidebar (ATTR); the plugin group sizes
             * the plugin page (PLUGIN_ATTR). They are separate attributes, so a density
             * chosen for the plugin page here changes the plugin page and nothing else - the
             * sidebar keeps its own. The plugin page toolbar trigger drives the same
             * attribute, so the two entries stay in sync instead of fighting.
             */
            /*
             * One group per surface, and the group is named after the surface it drives:
             * the plugin-page trigger sizes the plugin page, so calling its only group
             * "sessions" would promise the wrong thing.
             */
            h('div', { className: 'dsh-view-density-menu-label' }, isPlugin ? COPY.plugins : COPY.session),
            MODES.filter((id) => id !== 'custom').map((id) => row(isPlugin ? 'plugins' : 'session', id, id === active, pick)),
            colsSlider('cols-' + (isPlugin ? 'plugins' : 'session'), isPlugin ? 'plugins' : 'session', pick, active),
            heightSlider('height-' + (isPlugin ? 'plugins' : 'session'), isPlugin ? 'plugins' : 'session', pick, active),
            /*
             * The sidebar trigger's second group sizes the panel navigation that sits directly
             * beneath it - Purge, skills, memory, search, IG5 and more - not the plugin page.
             * The plugin page keeps its own trigger in its own toolbar.
             */
            isPlugin
              ? null
              : h('div', { className: 'dsh-view-density-menu-label' }, COPY.panels),
            isPlugin ? null : MODES.filter((id) => id !== 'custom').map((id) => row('panels', id, id === panelMode, setPanelMode)),
            isPlugin ? null : colsSlider('cols-panels', 'panels', setPanelMode, panelMode),
            isPlugin ? null : heightSlider('height-panels', 'panels', setPanelMode, panelMode),
          )
        : null;

      // A portal keeps the panel out of the toolbar's own layout and clipping context.
      const menuNode = isPlugin && menu && typeof document !== 'undefined' && document.body
        ? reactDom.createPortal(menu, document.body)
        : menu;

      const buttonTitle = (isPlugin ? COPY.pluginsHint : COPY.hint) + ' / ' + MODE_LABEL[active];

      const control = h(
        'span',
        {
          /*
           * One wrapper for both hosts. The rail variant is an inline row icon, so it centres
           * itself; the portalled variant sits next to the phone/computer icons and must not
           * stretch into the row's leftover width.
           */
          style: {
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            flex: 'none',
            ...(rail && !isPlugin ? { justifyContent: 'center' } : null),
          },
          ref: wrap,
        },
        h(
          'button',
          {
            type: 'button',
            title: buttonTitle,
            'aria-label': isPlugin ? COPY.pluginsHint : COPY.hint,
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            style: rail
              ? (hover || open ? { ...OPEN_BUTTON_STYLE, ...RAIL_BUTTON_STYLE } : { ...BUTTON_STYLE, ...RAIL_BUTTON_STYLE })
              : (hover || open ? OPEN_BUTTON_STYLE : BUTTON_STYLE),
            onMouseEnter: () => setHover(true),
            onMouseLeave: () => setHover(false),
            onClick: () => setOpen((value) => !value),
          },
          viewGlyph(),
        ),
        menuNode,
      );

      if (isPlugin) return control;

      /*
       * The sidebar trigger must stay reachable. The account row is only a portal target; when it
       * is absent (first paint, collapsed rail, a host layout change) the trigger renders in place
       * inside the footer slot instead, which keeps the control discoverable rather than dropping
       * it on the floor.
       */
      const seat = footerRow();
      if (seat) return reactDom.createPortal(control, seat, `footer-${ticket}`);
      return control;

    }
    const MENU_WRAP_STYLE = { position: 'relative', display: 'inline-flex', alignItems: 'center' };
    /** On the plugin page toolbar the trigger is a toolbar peer, so it never rail-shrinks. */
    const PLUGIN_WRAP_STYLE = { position: 'relative', display: 'inline-flex', alignItems: 'center' };

    const BUTTON_STYLE = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      padding: 0,
      border: 'none',
      borderRadius: 6,
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
      opacity: 0.75,
    };

    const OPEN_BUTTON_STYLE = {
      ...BUTTON_STYLE,
      opacity: 1,
      background: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.14))',
    };

    /**
     * Collapsed rail: the host shrinks the account row to icons only, so the trigger grows to the
     * same 36x36 target the mobile plugin uses for its own rail variant.
     */
    const RAIL_BUTTON_STYLE = {
      width: 36,
      height: 36,
      margin: '2px 0',
      borderRadius: 8,
    };
    /* -------------------------------------------------------------- placement */

    /**
     * The account row is where the phone and computer icons live.
     *
     * The mobile plugin wraps *its own* two icons in a bordered `dshm_footerGroup` box: that box
     * means "mobile and remote access", and the view switch has nothing to do with either. So the
     * trigger is a separate portal target placed as the box's left sibling: same row, same
     * metrics, no shared outline.
     *
     * The anchor is `[data-slot="settings.launcher"]` (the avatar outlet) because it is the only
     * stable landmark in that row. Parking is done by React `createPortal` into that row rather
     * than by moving a slot-rendered node: a node moved out of its slot makes the host's own
     * unmount fail with `removeChild` on a foreign parent, which crashed the whole sidebar slot.
     */
    const SEAT = '[data-slot="sidebar.settings"]';
    const ANCHOR = '[data-slot="settings.launcher"]';
    const MOBILE_GROUP = '[data-dshm-footer-group]';

    /** The row to render into, or null while the sidebar is collapsed or not mounted yet. */
    const footerRow = () => {
      if (typeof document === 'undefined' || !document) return null;
      const outlet = document.querySelector(ANCHOR);
      const row = outlet && outlet.parentElement;
      if (!row || typeof row.insertBefore !== 'function') return null;
      // Only anchor inside the real sidebar seat: a launcher rendered elsewhere (settings panel,
      // a future layout) would otherwise pull the control into the wrong container.
      if (typeof outlet.closest === 'function' && outlet.closest(SEAT) === null) return null;
      return row;
    };

    /** Insertion point: the mobile box when present, otherwise the avatar outlet itself. */
    const footerAnchor = () => {
      const row = footerRow();
      if (!row) return null;
      const group = document.querySelector(MOBILE_GROUP);
      return group && group.parentElement === row ? group : document.querySelector(ANCHOR);
    };

    const mark = (stage, detail) => {
      try {
        const root = document.documentElement;
        if (root) root.setAttribute('data-dsh-view-density-stage', detail === undefined ? stage : `${stage}:${detail}`);
      } catch {
        /* a page that cannot be marked must still try to render */
      }
      try {
        globalThis.localStorage?.setItem('dsh-sidebar-view-density:stage', detail === undefined ? stage : `${stage}:${detail}`);
      } catch {
        /* private mode without storage */
      }
    };

    /* ---------------------------------------------------------------- plugin */

    let appliedCtx = null;

    /**
     * Render into the footer slot, then relocate our node to the left of the account row's icon box.
     *
     * The slot is still registered, so the plugin stays a normal slot participant and receives the
     * `wide` prop; only the final resting position differs from where the slot rendered us.
     * `insertBefore` against the mobile box keeps us on the row without joining its outline.
     */
    function FooterHost({ wide }) {
      return h('span', { style: { display: 'contents' } }, h(ViewDensityButton, { wide }));
    }

    /**
     * Mount a second, independent trigger into the plugin page toolbar.
     *
     * The plugin page is a main-column page, not a sidebar panel, and its toolbar is rebuilt
     * whenever the page re-renders - so this runs on the same rAF + MutationObserver schedule as
     * the sidebar trigger, but targets `[data-plugin-toolbar]` and drives `PLUGIN_ATTR`.
     *
     * Kept as a plain DOM mount rather than a slot because no plugin-page toolbar slot exists;
     * `data-plugin-toolbar` is host-written and therefore stable across builds.
     */
    function mountPluginTrigger(ctx) {
      if (typeof document === 'undefined' || !document || !document.body) return () => {};

      const host = document.createElement('div');
      host.setAttribute('data-dsh-view-density-plugin-host', '');

      let root = null;
      let frame = 0;
      let observer = null;

      const place = () => {
        const toolbar = document.querySelector('[data-plugin-toolbar]');
        if (!toolbar) return null;
        /*
         * Sit before the first child so the trigger reads as a peer of the refresh / add-plugin
         * buttons. `insertBefore` against a slot we own is safe: the host never adopted this node,
         * so its own unmount has nothing of ours to release.
         */
        if (host.parentElement !== toolbar || toolbar.firstElementChild !== host) {
          toolbar.insertBefore(host, toolbar.firstElementChild);
        }
        return toolbar;
      };

      const render = () => {
        if (root === null) return;
        root.render(h(ViewDensityButton, { variant: 'plugin' }));
      };

      const settle = () => {
        frame = 0;
        try {
          const toolbar = place();
          if (!toolbar) return;
          if (root === null) {
            root = reactDomClient.createRoot(host);
            render();
          }
        } catch {
          /* the toolbar can be mid-render; the observer retries */
        }
      };

      settle();

      const Observer = typeof window !== 'undefined' ? window.MutationObserver : undefined;
      if (typeof Observer === 'function') {
        observer = new Observer(() => {
          if (frame !== 0) return;
          const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
          frame = raf(settle);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }

      return () => {
        if (observer !== null) observer.disconnect();
        if (frame !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
        try {
          if (root !== null) root.unmount();
        } catch {
          /* already gone */
        }
        host.remove();
      };
    }
    /**
     * Renderer-side reload hotkey.
     *
     * The desktop shell registers no F5 accelerator (its application menu is null on win32), so the
     * embedded page never sees F5 reach the browser's own reload path. This listens in the renderer
     * instead and forwards the intent to location.reload(), which is the same document reload the
     * tray item performs. Skipped when the shell patch is active, to avoid a double reload.
     */
    const bindReloadHotkey = () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
      const onKeyDown = (event) => {
        if (event.defaultPrevented || event.isComposing) return;
        const plainF5 = event.key === 'F5' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
        const chordR = (event.key === 'r' || event.key === 'R') && (event.ctrlKey || event.metaKey) && !event.altKey;
        if (!plainF5 && !chordR) return;
        event.preventDefault();
        try {
          window.location.reload();
        } catch {
          /* a reload that cannot start leaves the page as it is */
        }
      };
      window.addEventListener('keydown', onKeyDown, true);
      return () => window.removeEventListener('keydown', onKeyDown, true);
    };

    return {
      inject: ['slots'],
      apply(ctx) {
        if (ctx === appliedCtx) return;
        appliedCtx = ctx;
        mark('apply');
        try {
          injectStyle();
          applyMode(currentMode);
          applyPluginMode(currentPluginMode);
          applyPanelMode(currentPanelMode);
          applyCustom();
          mark('styled');
          bindReloadHotkey();
          mountPluginTrigger(ctx);
          /*
           * Register in the footer slot so the trigger still renders when the account row is
           * unavailable (collapsed rail, first paint, a host layout change). The component portals
           * itself into the row when it can find it and falls back to the slot position otherwise,
           * so this registration never leaves an empty gap on its own.
           */
          ctx.slots.inject(FOOTER_SLOT, () =>
            ctx.slots.register({
              name: FOOTER_SLOT,
              id: 'dsh-sidebar-view-density',
              order: 18,
              label: () => COPY.label,
            }, FooterHost),
          );
          /*
           * The settings section is a convenience surface: if the host has no such slot
           * (older build, different profile) the trigger and the menu still work, so the
           * registration must not be able to fail the whole plugin.
           */
          try {
            ctx.slots.inject('settings.section', () =>
              ctx.slots.register(
                {
                  name: 'settings.section',
                  id: 'dsh-sidebar-view-density',
                  order: 60,
                  label: () => COPY.settingsTitle,
                },
                ViewDensitySettings,
              ),
            );
          } catch {
            /* no settings slot in this host */
          }
          mark('ready');
        } catch (error) {
          mark('failed', error && error.message ? String(error.message).slice(0, 120) : 'unknown');
          throw error;
        }
      },
    };
  },
});