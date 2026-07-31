interface TestSharedConfig {
  font: {
    family: string | null;
    boldFamily: string | null;
    italicFamily: string | null;
    boldItalicFamily: string | null;
    size: number | null;
  };
  colors: {
    foreground: string | null;
    background: string | null;
    cursor: string | null;
    cursorText: string | null;
    selectionBackground: string | null;
    selectionForeground: string | null;
    ansi: Record<string, string>;
  };
  window: {
    opacity: number | null;
    paddingX: number | null;
    paddingY: number | null;
    decorations: string | null;
  };
  cursor: {
    shape: string | null;
    blink: boolean | null;
  };
  behavior: {
    scrollbackLines: number | null;
    visualBell: boolean | null;
    attentionOnBell: boolean | null;
    copyOnSelect: boolean | null;
    middleClickPaste: boolean | null;
    confirmClose: boolean | null;
  };
}

export function makeSharedConfig(): TestSharedConfig {
  return {
    font: {
      family: null,
      boldFamily: null,
      italicFamily: null,
      boldItalicFamily: null,
      size: null,
    },
    colors: {
      foreground: null,
      background: null,
      cursor: null,
      cursorText: null,
      selectionBackground: null,
      selectionForeground: null,
      ansi: {},
    },
    window: {
      opacity: null,
      paddingX: null,
      paddingY: null,
      decorations: null,
    },
    cursor: {
      shape: null,
      blink: null,
    },
    behavior: {
      scrollbackLines: null,
      visualBell: null,
      attentionOnBell: null,
      copyOnSelect: null,
      middleClickPaste: null,
      confirmClose: null,
    },
  };
}
