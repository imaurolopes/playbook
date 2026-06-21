import { getTheme } from "@/lib/content/load";

function toCssBlock(selector: string, tokens: Record<string, string>) {
  const declarations = Object.entries(tokens)
    .map(([name, value]) => `--${name}: ${value};`)
    .join("");
  return `${selector}{${declarations}}`;
}

export function ThemeStyles() {
  const theme = getTheme();
  const light = theme.tokens.light ?? {};
  const dark = theme.tokens.dark ?? {};
  const css = `${toCssBlock(":root", light)}${toCssBlock(".dark", dark)}`;

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
