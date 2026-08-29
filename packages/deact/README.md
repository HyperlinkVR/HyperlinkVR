# @hyperlinkvr/deact

Compile a React/Preact component into a single self-contained CDN script. Assets and CSS (Tailwind) are inlined, so the output is one `.js` file you can drop in with a `<script>` tag.

## Building


```
pnpm install
pnpm build
npm link
```

With npm link being optional (adds `deact` to your PATH to use anywhere).

## Usage

```
deact <inputs...> [options]
```

Each input is a `.tsx` file that exports one component (default export, or a single named export).

```
deact ./src/HyperlinkSplash.tsx
```

### Options

| Flag                             | Default         | Description                                                               |
|----------------------------------|-----------------|---------------------------------------------------------------------------|
| `-t, --type <target>`            | `web-component` | Output target: `web-component` or `legacy-dom`.                           |
| `-s, --shadow <boolean>`         | `true`          | Use Shadow DOM (`legacy-dom` only).                                       |
| `-o, --out-dir <dir>`            | `./dist`        | Output directory.                                                         |
| `-n, --name <name>`              | —               | Custom tag name (`web-component`) or global function name (`legacy-dom`). |
| `-c, --css-path-override <path>` | —               | Use a custom CSS entry instead of the default Tailwind file.              |

## Targets

**`web-component`** registers a custom element. The tag name is derived from the filename (or `--name`):

```html
<script src="hyperlink-splash.js"></script>
<hyperlink-splash custom_subtext="hello"></hyperlink-splash>
```

**`legacy-dom`** exposes a global `init_<name>` function that mounts the component into a container:

```html
<script src="HyperlinkSplash.js"></script>
<script>
  init_HyperlinkSplash({ custom_subtext: "hello" }, "#target");
</script>
```
