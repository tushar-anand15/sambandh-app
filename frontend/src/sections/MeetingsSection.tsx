import BodySelector from "@/components/select/BodySelector";

/**
 * The Meetings section.
 *
 * The heading, the lede and the selector come from the routing unit; the
 * figures below them belong to this section alone. Selection state lives in
 * the URL, so read it with the router rather than holding it here.
 *
 * Unit 8 fills this: the counts by category and nature, and the meeting list.
 */
export default function MeetingsSection() {
  return (
    <div className="shell-container section-page">
      <h1>Meetings</h1>
      <p className="lede">
        Meetings held, by category and by nature, from the Sakarma meeting manifest.
      </p>
      <BodySelector section="meetings" />
    </div>
  );
}
