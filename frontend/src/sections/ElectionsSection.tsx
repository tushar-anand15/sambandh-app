import BodySelector from "@/components/select/BodySelector";

/**
 * The Elections section.
 *
 * The heading, the lede and the selector come from the routing unit; the
 * figures below them belong to this section alone. Selection state lives in
 * the URL, so read it with the router rather than holding it here.
 *
 * Unit 9 fills this: the drill-down map, the ward table and the boundary layers.
 */
export default function ElectionsSection() {
  return (
    <div className="shell-container section-page">
      <h1>Elections</h1>
      <p className="lede">
        Ward-level results across the 2010, 2015, 2020 and 2025 cycles, with the boundary layers they are drawn on.
      </p>
      <BodySelector section="elections" />
    </div>
  );
}
