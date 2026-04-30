# Design Token Reference

Documentation for the design system tokens used in the cf-blog UI.

## CSS Custom Properties

These CSS custom properties are defined globally and available throughout the application.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#050505` | Main background |
| `--bg-secondary` | `#0f0f0f` | Secondary backgrounds, sidebar |
| `--bg-card` | `#111111` | Card backgrounds |
| `--border` | `#1f1f1f` | Default borders |
| `--text-primary` | `#f5f5f5` | Primary text |
| `--text-secondary` | `#888888` | Secondary text, descriptions |
| `--text-muted` | `#555555` | Muted text, timestamps |
| `--accent` | `#ff6b00` | Primary accent color (CTA buttons, links) |
| `--accent-light` | `#ff8534` | Lighter accent variant |
| `--accent-glow` | `rgba(255, 107, 0, 0.3)` | Glow/shadow effect with accent |
| `--gradient-accent` | `linear-gradient(135deg, #ff6b00 0%, #ff8534 100%)` | Gradient for buttons |

## Tailwind Equivalents

### Backgrounds

| CSS Custom Property | Tailwind Class |
|---------------------|---------------|
| `--bg-primary: #050505` | `bg-[#050505]` or use `bg-neutral-950` with custom config |
| `--bg-secondary: #0f0f0f` | `bg-[#0f0f0f]` or `bg-neutral-900` |
| `--bg-card: #111111` | `bg-[#111111]` or `bg-neutral-900` |

### Borders

| CSS Custom Property | Tailwind Class |
|---------------------|---------------|
| `--border: #1f1f1f` | `border-[#1f1f1f]` or `border-neutral-800` |

### Text

| CSS Custom Property | Tailwind Class |
|---------------------|---------------|
| `--text-primary: #f5f5f5` | `text-[#f5f5f5]` or `text-neutral-200` |
| `--text-secondary: #888888` | `text-[#888888]` or `text-neutral-400` |
| `--text-muted: #555555` | `text-[#555555]` or `text-neutral-600` |

### Accent Colors

| CSS Custom Property | Tailwind Class |
|---------------------|---------------|
| `--accent: #ff6b00` | `text-[#ff6b00]`, `bg-[#ff6b00]` |
| `--accent-light: #ff8534` | `text-[#ff8534]`, `bg-[#ff8534]` |
| `--accent-glow: rgba(255,107,0,0.3)` | `shadow-[0_0_15px_rgba(255,107,0,0.3)]` |

### Gradients

| CSS Custom Property | Tailwind Class |
|---------------------|---------------|
| `--gradient-accent` | `bg-gradient-to-br from-[#ff6b00] to-[#ff8534]` |

## Component Patterns

### Card

```html
<!-- Base card -->
<div class="bg-bg-card border border-border rounded-xl shadow">
  <!-- content -->
</div>
```

Tailwind equivalent:
```html
<div class="bg-[#111111] border border-[#1f1f1f] rounded-xl shadow">
```

### Article Card Hover State

```html
<div class="card group hover:border-accent hover:-translate-y-0.5 hover:shadow-accent-glow transition-all duration-200">
```

Key effects:
- `border-accent` - Orange border on hover
- `-translate-y-0.5` - Lift effect (2px up)
- `shadow-accent-glow` - Orange glow shadow
- `transition-all duration-200` - Smooth transitions

### Tags

```html
<!-- Tag pill -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-border text-text-secondary hover:border-accent hover:text-accent transition-colors">
  Tag
</span>
```

### Buttons

#### Primary Button (Gradient)

```html
<button class="bg-gradient-to-br from-[#ff6b00] to-[#ff8534] text-white font-medium px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity">
  Primary
</button>
```

#### Secondary Button

```html
<button class="bg-[#0f0f0f] border border-[#1f1f1f] text-[#f5f5f5] font-medium px-6 py-2.5 rounded-lg hover:border-accent transition-colors">
  Secondary
</button>
```

#### Danger Button

```html
<button class="bg-red-600 text-white font-medium px-6 py-2.5 rounded-lg hover:bg-red-700 transition-colors">
  Delete
</button>
```

### Admin Table

```html
<table class="w-full">
  <thead>
    <tr class="border-b border-[#1f1f1f]">
      <th class="text-left text-xs uppercase tracking-wider text-[#555555] pb-3">Column</th>
    </tr>
  </thead>
  <tbody>
    <tr class="border-b border-[#1f1f1f] hover:bg-[#0f0f0f]">
      <td class="py-4 text-[#f5f5f5]">Value</td>
    </tr>
  </tbody>
</table>
```

### Editor/Preview Pane Styling

```html
<!-- Editor pane -->
<div class="flex-1 bg-[#050505] border-r border-[#1f1f1f] p-4">
  <textarea class="w-full h-full bg-transparent text-[#f5f5f5] resize-none focus:outline-none font-mono text-sm" />
</div>

<!-- Preview pane -->
<div class="flex-1 bg-[#111111] p-4 overflow-auto">
  <div class="prose prose-invert max-w-none">
    <!-- rendered content -->
  </div>
</div>
```

## Typography

### Heading Sizes

| Element | Size | Weight | Letter Spacing | Tailwind Class |
|---------|------|--------|----------------|----------------|
| H1 | 2.5rem / 40px | 700 | -0.02em | `text-[2.5rem] font-bold tracking-tight` |
| H2 | 2rem / 32px | 700 | -0.02em | `text-[2rem] font-bold tracking-tight` |
| H3 | 1.5rem / 24px | 600 | -0.01em | `text-2xl font-semibold tracking-tight` |
| H4 | 1.25rem / 20px | 600 | 0 | `text-xl font-semibold` |
| H5 | 1.125rem / 18px | 500 | 0 | `text-lg font-medium` |
| H6 | 1rem / 16px | 500 | 0 | `text-base font-medium` |

### Body Text

| Style | Size | Weight | Line Height | Tailwind Class |
|-------|------|--------|-------------|----------------|
| Body Large | 1.125rem / 18px | 400 | 1.75 | `text-lg leading-relaxed` |
| Body | 1rem / 16px | 400 | 1.75 | `text-base leading-relaxed` |
| Body Small | 0.875rem / 14px | 400 | 1.5 | `text-sm leading-relaxed` |
| Caption | 0.75rem / 12px | 400 | 1.4 | `text-xs` |

### Code

| Style | Size | Tailwind Class |
|-------|------|----------------|
| Inline code | 0.875rem | `text-sm font-mono` |
| Code block | 0.875rem | `text-sm font-mono` |

## Usage Example

```tsx
import { cn } from "@/lib/utils";

const Card = ({ children, className }) => (
  <div className={cn(
    "bg-[#111111] border border-[#1f1f1f] rounded-xl shadow",
    className
  )}>
    {children}
  </div>
);

const Button = ({ variant = "primary", children }) => (
  <button className={cn(
    "font-medium px-6 py-2.5 rounded-lg transition-opacity",
    variant === "primary" && "bg-gradient-to-br from-[#ff6b00] to-[#ff8534] text-white hover:opacity-90",
    variant === "secondary" && "bg-[#0f0f0f] border border-[#1f1f1f] text-[#f5f5f5] hover:border-[#ff6b00]",
    variant === "danger" && "bg-red-600 text-white hover:bg-red-700"
  )}>
    {children}
  </button>
);
```
