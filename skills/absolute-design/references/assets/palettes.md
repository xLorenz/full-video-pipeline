# Ready Palettes

Copy-adaptable palettes with hex values. Treat these as *seeds* — verify contrast against your actual pairings and shift lightness to fit the brief. Role templates at the bottom are the ones to use for systems/UI work.

---

## 1. Neutral ramps (tinted, not dead gray)

**Warm gray (use with earthy/retro/luxury work):**
`#FBF9F6` `#F2EDE7` `#E4DCD2` `#C9BDB0` `#A79A8B` `#7D7267` `#5A524A` `#3B352F` `#26221E` `#171412`

**Cool gray (use with tech/institutional/clean work):**
`#F7F9FA` `#EDF1F4` `#DCE3E9` `#BCC7D1` `#93A1AE` `#6B7A88` `#4C5A67` `#33404B` `#1F2A33` `#121A21`

**Paper/ink (print, editorial):**
`#FCFAF5` `#F4EFE4` `#E6DCC8` `#C4B8A0` `#8C8172` `#5E564B` `#3E372F` `#2A251F`

Always tint neutrals slightly toward your anchor hue. A cool brand with warm gray text looks subtly wrong, and the audience feels it before they can name it.

---

## 2. Style palettes (each: base field · ink · accents)

### Swiss International
`#F7F7F5` paper · `#1A1A1A` ink · `#E1251B` signal red · `#9B9B9B` mid gray · `#1B3A6B` deep blue
*Use: 90% black on paper; red only for the one thing that must be seen first.*

### Bauhaus
`#FAFAFA` white · `#111111` black · `#E63329` red · `#F0C808` yellow · `#1F5FA9` blue · `#8A8A8A` gray
*Use: primaries as flat blocks, one dominant per composition.*

### Art Deco
`#0E1A38` night navy · `#F7F0DC` ivory · `#D4AF37` gold · `#0F6B6B` teal · `#E2725B` coral · `#B8B8B8` silver
*Use: navy/black ground, gold as the metal, ivory type; metallic sheen gradients allowed.*

### Art Nouveau
`#FAF3E0` cream · `#4A2545` deep plum · `#C9A227` pale gold · `#8FBC8F` sage green · `#B39DDB` lavender · `#E8A0A0` rose
*Use: cream ground with plum/gold line work; pastels for fills.*

### Arts & Crafts
`#F2E8D5` parchment · `#3B2F2F` ink brown · `#7B2D26` deep red · `#2E4B3C` forest · `#2C3A5A` indigo · `#B8860B` gold
*Use: dark earthy field or parchment ground; gold for ornament.*

### Mid-Century Modern
`#F3E9D2` cream · `#3A3A3A` charcoal · `#E0A32E` mustard · `#C75B39` burnt orange · `#6B7A45` olive · `#2A7F8E` teal · `#D98E8E` dusty pink
*Use: warm creams/charcoals; mustard and orange as the duo; texture layer mandatory.*

### Psychedelic
`#12063A` deep ground · `#E4002B` red · `#0047AB` blue · `#7D26CD` violet · `#F4E04D` acid yellow · `#FF6B1A` orange · `#00A86B` green · `#D6006E` magenta
*Use: complementary pairs adjacent for vibration; dark ground makes saturation sing.*

### Punk
`#0D0D0D` xerox black · `#EDEDED` paper · `#FF2A00` safety red · `#FF3B8B` fluoro pink
*Use: black/white only, or black + one spot. No mid-tones.*

### Memphis
`#FFF8E7` cream · `#2B2B2B` charcoal · `#FF4F81` hot pink · `#2E5BFF` electric blue · `#F6E200` acid yellow · `#F63A2F` red · `#6EE7B7` mint · `#B28DFF` lilac
*Use: clash deliberately; keep one repeating shape or color as the binder.*

### Grunge
`#2B2118` espresso · `#3E4A3D` dark moss · `#8A4B2B` burnt sienna · `#6E6A66` smoke · `#D6CFC2` bone · `#7A1F1F` blood red
*Use: dark muddy grounds; bone/blood as the contrast moments; texture over everything.*

### Minimalism
`#FBFBF9` paper · `#111111` ink · `#8E8B85` warm gray · accent options: `#1F3AE0` Klein blue / `#7D8B76` sage / `#B85C38` terracotta / `#0F0F0F` pure black
*Use: one accent only; the accent's scarcity is what makes it powerful.*

### Brutalism
`#FFFFFF` white · `#000000` black · `#0000FF` link blue · `#FFE500` warning yellow · `#FF0000` raw red · `#C7C7C7` concrete
*Use: system-default hues on purpose; harsh adjacency is the aesthetic.*

### Maximalism (starter set)
`#18112B` ink violet · `#6C2BD9` electric violet · `#C5E617` lime · `#FF5E5B` hot coral · `#7AD3FF` sky · `#B0B7C3` chrome · `#F5E9FF` soft lilac
*Use: saturated duos + pastels + one chrome/neon; bind with a shared temperature.*

### Luxury / editorial dark
`#101014` near-black · `#1A1A20` surface · `#C9A227` gold · `#E8E4DA` off-white · `#7A7A85` muted gray · `#4A3B22` bronze
*Use: gold as 5% accent only; off-white text (never pure white).*

---

## 3. Semantic role templates

### Light theme
```
background:            #FBFBF9
surface:               #FFFFFF
surface-2:             #F2F0EC
outline:               #D8D4CD
text-primary:          #17171A
text-secondary:        #5B5B62
primary:               #1F3AE0        /* replace with brand anchor */
on-primary:            #FFFFFF
primary-container:     #E1E6FF
on-primary-container:  #0B1F8F
accent:                #C2410C        /* one accent hue */
success:               #15803D / container #DCFCE7 / on #14532D
warning:               #B45309 / container #FEF3C7 / on #78350F
error:                 #B91C1C / container #FEE2E2 / on #7F1D1D
```

### Dark theme
```
background:            #121212
surface:               #1C1C1E
surface-2:             #2C2C2E
outline:               #3A3A3C
text-primary:          #F5F5F4        /* never #FFF on #000 */
text-secondary:        #A1A1A6
primary:               #A5B4FC
on-primary:            #17206B
primary-container:     #27307A
on-primary-container: #DDE3FF
accent:                #FDBA74
success/warning/error: shift each base ~25% lighter; keep containers darker than light-theme containers
```

---

## 4. Deriving a palette from an image or brand color

1. Sample the dominant hue and its temperature; set it as anchor.
2. Build a 10-step neutral ramp tinted by ±5% toward the anchor hue.
3. Generate tints/shades of the anchor in ~10% lightness steps (OKLCH if available).
4. Pick the accent as the anchor's complement (or split-complement) at lower chroma.
5. Run the contrast audit on every text pair (see `../foundations/color-and-palettes.md`).
6. Reduce to roles. If you can't name a swatch's job, delete it.

## 5. Accessibility quick gate

- [ ] Body text pairs ≥ 4.5:1; large text & UI ≥ 3:1 (check the *actual* pairs)
- [ ] No meaning carried by hue alone
- [ ] Dark theme separately checked, not derived by inversion
- [ ] Grays tinted, not `#808080`
- [ ] Accent is scarce (≤10% of the surface) so it retains signal
