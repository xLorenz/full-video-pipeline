# DeepConfig — Field Reference

Every template instance is a `TemplateConfig` JSON document. The same core shape applies to all templates; per-template `extras` and per-element `custom` extend it (see each template's `animation.md`).

```jsonc
{
  "$schema": "../../../schemas/animations.schema.json",  // optional but recommended
  "instanceId": "string",                                 // optional, debugging only

  "theme": {                                             // OPTIONAL — omit entirely to use styles.ts
    "palette": {                                          //   all keys optional; any omitted falls back to styles.ts COLORS
      "primary":   "#0F1B2D",
      "secondary": "#00BFA6",
      "accent":    "#FFB300",
      "background": "#0A1220",
      "text":      "#FFFFFF",
      "muted":      "#4A5568",                            //   only the keys you override
      "danger":     "#EF4444",
      "success":    "#10B981",
      "gridLine":   "#1A2744"
    },
    "fonts": {                                            //   optional; overrides styles.ts FONTS
      "heading": "Inter",
      "body":    "Poppins",
      "mono":    "JetBrains Mono"                        //   templates that show numbers may pick up mono
    },
    "sizes": {                                            //   optional; default { "scale": 1.0 }
      "scale": 1.0                                        //   multiplies the resolved FONT_SIZES at every level
    }
  },

  "global": {                                             // OPTIONAL — timing defaults for this instance
    "speed": 1.0,                                          //   multiplier applied to ALL delays+durations (1.0 = as authored)
    "delayOffset": 0,                                     //   frames added to every delay (stagger/offset the whole instance)
    "easing": "ease-out-cubic"                             //   default easing; element override wins. Registry below.
  },

  "elements": [                                            // OPTIONAL per-element override; unrecognized ids are ignored
    {
      "id": "title",                                       //   stable id from this template's animation.md — REQUIRED if the element is listed
      "text":     "Earth has rings",                      //   string; null/undefined → fall back to defaults
      "delay":     null,                                   //   number (frames) OR null → auto-stagger based on parent timing
      "duration":  null,
      "easing":    null,
      "position": { "x": null, "y": null },               //   null → template default layout; numbers are pixels, anchored by template
      "size":     { "fontSize": null, "scale": null },    //   fontSize = explicit px, scale = multiplier
      "color":     null,                                   //   hex string; null → resolved theme palette
      "hidden":    false,                                  //   true removes the element entirely from this instance
      "custom":    {}                                      //   template-specific per-element fields declared in template's schema.json
    }
  ],

  "extras": {}                                             // OPTIONAL — template-specific globals, declared in template's schema.json
}
```

## Resolved-values rules

1. **Explicit value wins** — any field you set overrides the default.
2. **`null` means "auto"** — for timing (`delay`/`duration`): falls into the parent's auto-stagger schedule; for layout (`position`/`size`): falls to the template default; for `color`: resolves via the `theme.palette` and element role.
3. **Theme fall-through** — omitting `theme.palette.primary` keeps the styles.ts `COLORS.primary`. Setting it overrides only that key.
4. **Speed is multiplicative** — `"speed": 1.5` stretches every element's delay+dur by 50%; per-element explicit values still win.
5. **`hidden: true` collapses layout** — subsequent siblings reflow as if the element were never authored.
6. **Unrecognized `elements[].id`** — ignored silently (to allow templates to share a base config); a warning is logged at preview time.

## Easing registry

Use any of these names in `global.easing` or `elements[].easing`:

| Name | Curve | Use for |
|---|---|---|
| `linear` | y = x | Steady progress (e.g. number count-up) |
| `ease-in` | cubic-in | egress/diverge |
| `ease-out` | cubic-out | settle-in entrances (DEFAULT) |
| `ease-in-out` | cubic-in-out | symmetric sweeps |
| `ease-out-cubic` | cubic-out (alias) | default alias |
| `ease-in-cubic` | cubic-in (alias) | |
| `ease-out-quint` | x^5 out | snapping emphasis pop |
| `ease-out-expo` | exponential out | snappy decisive endings |
| `ease-out-back` | back-overshoot | friendly bounce-in for cards |
| `ease-in-back` | back-in to undershoot | anticipate exits |

Implemented in `animations/_shared/timing.ts`. Anything else routed through `Easing.bezier` is forbidden in templates (we don't expose unbounded bezier control here to keep validations reproducible).

## Recipes

### Speed up a whole instance
```json
{ "global": { "speed": 1.5 } }
```

### Recolor one element only
```json
{
  "theme": { "palette": { "accent": "#FFB300" } },
  "elements": [
    { "id": "verdict-stamp", "color": "#10B981" }
  ]
}
```

### Swap fonts only for this scene, keep palette
```json
{ "theme": { "fonts": { "heading": "Anton", "body": "Inter" } } }
```

### Hide an element the template includes by default
```json
{ "elements": [ { "id": "subtitle", "hidden": true } ] }
```

### Bigger text globally on a tall scene
```json
{ "theme": { "sizes": { "scale": 1.25 } } }
```

### Offset the entire instance by 30 frames
```json
{ "global": { "delayOffset": 30 } }
```

## Schema vs this doc

The authoritative spec is [`../schemas/animations.schema.json`](../schemas/animations.schema.json) (JSON Schema Draft 7). This document is human-readable and may lag the schema; if they disagree, the schema wins. Per-template extensions live in each template's `config/schema.json` with `$ref` into the global schema.
