/**
 * What the council decided, as the council published it.
 *
 * The panel shows one meeting's decision register or minutes. It states where
 * the document came from under it, because a register is the portal's text and
 * not this site's reading of it, and a reader who wants to check the wording
 * has to be able to name the object it was read from.
 */

import HtmlDrawer from "@/components/viewer/HtmlDrawer";
import SourceLine from "@/components/shell/SourceLine";

import styles from "./meetings.module.css";
import { bodyLabel, formatDate, type DocumentKind } from "./payload";
import { useRegister, type RegisterRequest } from "./useRegister";

interface RegisterDrawerProps {
  request: RegisterRequest | null;
  /** The meeting's own date and number, so the panel names what is open. */
  label: string;
  onClose: () => void;
}

export const KIND_LABEL: Record<DocumentKind, string> = {
  dr: "Decision register",
  minutes: "Minutes",
};

export default function RegisterDrawer({
  request,
  label,
  onClose,
}: RegisterDrawerProps) {
  const state = useRegister(request);
  if (!request) return null;

  const title = KIND_LABEL[request.kind];
  const ready = state.status === "ready" ? state.payload : null;

  return (
    <HtmlDrawer
      open
      title={title}
      subtitle={label}
      onClose={onClose}
      html={ready?.html}
    >
      {state.status === "loading" ? (
        <p className="selector-status" aria-busy="true">
          Loading the {title.toLowerCase()}.
        </p>
      ) : null}

      {state.status === "missing" ? (
        <p role="status" data-testid="register-missing">
          {state.payload.reason}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="notice" role="alert">
          {state.message}
        </p>
      ) : null}

      {ready ? (
        <>
          <p className={styles.registerHead}>
            {bodyLabel(ready.body)}
            {ready.meeting_date ? `, ${formatDate(ready.meeting_date)}` : null}. The
            document is Sakarma&rsquo;s own, with its scripts and Word formatting
            removed.
          </p>
          <SourceLine
            dataset={ready.provenance.dataset}
            build_date={ready.provenance.build_date}
            note={`Sakarma, gs://sulekhasakarma-meetings/${ready.source_path}`}
          />
        </>
      ) : null}
    </HtmlDrawer>
  );
}
