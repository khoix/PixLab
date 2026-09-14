# Execution 3 — accepted armor prototypes

Built-in imagegen prompt briefs:

- **Shield edit:** Original shield is the placement/oval-orientation target;
  revised sword and scanner define materials. Cyber-Aegis with dark overlapping
  ballistic plates, subtle radial organization, substantial brass central boss,
  small cyan core, restrained brass structure and no medieval lion/wood. Practical
  cybertech dominates classical lineage approximately 80/20. Crisp pixel masses,
  no engraving/bloom/background. Preserve normalized bounds x138–200, y74–150.
- **Helmet edit:** Original helmet is the 3/4 screen-right orientation/attachment
  target; sword and scope define materials. Modern enclosed combat helmet with
  Corinthian cheek/facial framing, segmented technological rear/top, brass ridge,
  selective cyan eye slit, no horsehair or literal historical costume. Preserve
  head/neck envelope x109–154, y43–104, and scope attachment near (134,76).
- **Helmet correction:** Background extraction only. Remove every baked
  checkerboard pixel and haze; actual transparent RGBA outside helmet. Preserve
  artwork, pose, colors and pixel edges. This corrected output was accepted.

Final layers remain 256×256 transparent PNGs at the original production paths:
`client/public/imgs/compendium/ops/armor/shield.png` and `armor/helmet.png`.
Sharp handled alpha cleanup and registration, not artwork generation. See handoff
for exact placement and `style-gate.png` for five real composited loadouts.

The style gate passed with the existing revised sword/spear and all four utilities.
Scanner intentionally overlays the shield; scope overlays the helmet eye.
No renderer, item mapping, gameplay or existing weapon changes were required.
