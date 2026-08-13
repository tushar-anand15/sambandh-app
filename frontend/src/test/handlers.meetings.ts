/**
 * MSW handlers for meetings.
 *
 * Owned by the Meetings section.
 *
 * The rows are the fixture slice's own, copied out of
 * `backend/tests/fixtures/master_slice.sql`: Chalakudy Municipality really did
 * record 64 meetings in 2023-24, 18 of them governing body and 31 of them
 * ordinary, from 12 October 2023 to 27 March 2024. A frontend assertion and a
 * backend assertion therefore quote the same number.
 *
 * The four answers the endpoint gives are all served here, because the page
 * renders each of them differently and a handler that only knew the happy path
 * would let three of the four rot:
 *
 *   Panoor  (G13064)               not covered at all
 *   Aluva   (M07025) before 2023-24  covered, nothing for that year
 *   Muttar  (G04036) in 2015-16    covered, and one meeting recorded
 *   Chalakudy (M08032)             the worked example
 */

import { http, HttpResponse } from "msw";

import type {
  BodyBlock,
  DocumentKind,
  MeetingRow,
  MeetingsMissing,
  MeetingsYear,
  RegisterMissing,
  RegisterDocument,
} from "@/components/meetings/payload";
import { bodies, cycles, districts, financialYears, knownCode, notFound, provenance } from "./handlers";

/** `backend/app/routers/meetings.py`, verbatim. */
export const SCOPE_NOTE =
  "Sakarma publishes a decision register and minutes for 420,561 of the " +
  "443,235 meetings in the manifest. Both open from the list below. PDF " +
  "attachments are named in the manifest and are not served here.";

export const NOT_COVERED_REASON = "Sakarma holds no meeting record for this body.";

const meetingsProvenance = { ...provenance, source: "Sakarma meeting manifest" };

/** The open year. Everything else in the fixture set is closed. */
const OPEN_YEAR = "2025-2026";

/**
 * The rows as the fixture holds them, with the two fields the endpoint adds
 * from `meetings.artifact`. Every meeting in this slice published both
 * documents except the last, which published neither — the case the list has
 * to render as an absence rather than a button.
 */
function withDocuments(rows: Omit<MeetingRow, "meeting_id" | "documents">[]): MeetingRow[] {
  return rows.map((row, index) => ({
    ...row,
    meeting_id: 9000 + index,
    documents:
      rows.length > 1 && index === rows.length - 1
        ? []
        : (["dr", "minutes"] as DocumentKind[]),
  }));
}

function bodyBlock(lbCode: string): BodyBlock {
  const body = bodies.find((b) => b.lb_code === lbCode)!;
  return {
    lb_code: body.lb_code,
    lb_name_en: body.lb_name_en,
    lb_name_ml: body.lb_name_ml,
    district_name: body.district_name,
    lb_type: body.lb_type,
  };
}

/** Chalakudy Municipality, 2023-24. Sixty-four rows, in the register's order. */
export const chalakudyMeetingRows: MeetingRow[] = withDocuments([
  {
    meeting_date: "2023-10-12",
    meeting_no: "2",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2023-10-19",
    meeting_no: "1",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "43",
  },
  {
    meeting_date: "2023-10-20",
    meeting_no: "3",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2023-10-27",
    meeting_no: "4",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2023-10-28",
    meeting_no: "1",
    meeting_type: "ധനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൗൺസിൽ ഹാൾ",
    category_code: "31",
  },
  {
    meeting_date: "2023-10-30",
    meeting_no: "1",
    meeting_type: "മരാമത്ത്കാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൗൺസിൽ ഹാൾ",
    category_code: "43",
  },
  {
    meeting_date: "2023-11-07",
    meeting_no: "2",
    meeting_type: "മരാമത്ത്കാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-11-07",
    meeting_no: "2",
    meeting_type: "ധനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-11-07",
    meeting_no: "1",
    meeting_type: "വികസനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-11-08",
    meeting_no: "5",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2023-11-20",
    meeting_no: "1",
    meeting_type: "ആരോഗ്യകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൗൺസിൽ ഹാൾ",
    category_code: "2",
  },
  {
    meeting_date: "2023-11-22",
    meeting_no: "2",
    meeting_type: "വിദ്യാഭ്യാസ കലാകായിക കാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-11-24",
    meeting_no: "4",
    meeting_type: "മരാമത്ത്കാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-11-28",
    meeting_no: "2",
    meeting_type: "ക്ഷേമകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-11-28",
    meeting_no: "2",
    meeting_type: "വികസനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-11-28",
    meeting_no: "3",
    meeting_type: "ധനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-11-29",
    meeting_no: "6",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2023-11-30",
    meeting_no: "7",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2023-12-11",
    meeting_no: "3",
    meeting_type: "ക്ഷേമകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "31",
  },
  {
    meeting_date: "2023-12-13",
    meeting_no: "5",
    meeting_type: "മരാമത്ത്കാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-12-14",
    meeting_no: "4",
    meeting_type: "ധനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-12-18",
    meeting_no: "8",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2023-12-26",
    meeting_no: "3",
    meeting_type: "ആരോഗ്യകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-12-27",
    meeting_no: "9",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2023-12-28",
    meeting_no: "3",
    meeting_type: "വിദ്യാഭ്യാസ കലാകായിക കാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-12-28",
    meeting_no: "3",
    meeting_type: "വികസനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-12-29",
    meeting_no: "4",
    meeting_type: "ക്ഷേമകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2023-12-30",
    meeting_no: "5",
    meeting_type: "ധനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-01-11",
    meeting_no: "1",
    meeting_type: "ക്ഷേമകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-01-11",
    meeting_no: "1",
    meeting_type: "ആരോഗ്യകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "31",
  },
  {
    meeting_date: "2024-01-15",
    meeting_no: "1",
    meeting_type: "ധനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-01-16",
    meeting_no: "1",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2024-01-16",
    meeting_no: "1",
    meeting_type: "വികസനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-01-17",
    meeting_no: "2",
    meeting_type: "മരാമത്ത്കാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-01-25",
    meeting_no: "2",
    meeting_type: "ആരോഗ്യകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൗൺസിൽ ഹാൾ",
    category_code: "2",
  },
  {
    meeting_date: "2024-01-27",
    meeting_no: "2",
    meeting_type: "ധനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-01-27",
    meeting_no: "2",
    meeting_type: "വികസനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-01-27",
    meeting_no: "3",
    meeting_type: "മരാമത്ത്കാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൗൺസിൽ ഹാൾ",
    category_code: "2",
  },
  {
    meeting_date: "2024-01-27",
    meeting_no: "2",
    meeting_type: "ക്ഷേമകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-01-27",
    meeting_no: "3",
    meeting_type: "ആരോഗ്യകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-01-27",
    meeting_no: "1",
    meeting_type: "വിദ്യാഭ്യാസ കലാകായിക കാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-02-02",
    meeting_no: "2",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2024-02-07",
    meeting_no: "4",
    meeting_type: "ധനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-02-09",
    meeting_no: "5",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2024-02-13",
    meeting_no: "3",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2024-02-13",
    meeting_no: "4",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2024-02-16",
    meeting_no: "3",
    meeting_type: "ക്ഷേമകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-02-17",
    meeting_no: "5",
    meeting_type: "ധനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-02-19",
    meeting_no: "4",
    meeting_type: "മരാമത്ത്കാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-02-22",
    meeting_no: "4",
    meeting_type: "ആരോഗ്യകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൗൺസിൽ ഹാൾ",
    category_code: "2",
  },
  {
    meeting_date: "2024-02-27",
    meeting_no: "7",
    meeting_type: "ധനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-02-28",
    meeting_no: "6",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "42",
  },
  {
    meeting_date: "2024-03-01",
    meeting_no: "7",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2024-03-07",
    meeting_no: "8",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2024-03-07",
    meeting_no: "5",
    meeting_type: "ആരോഗ്യകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-03-15",
    meeting_no: "9",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍",
    category_code: "2",
  },
  {
    meeting_date: "2024-03-15",
    meeting_no: "8",
    meeting_type: "ധനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-03-16",
    meeting_no: "6",
    meeting_type: "ആരോഗ്യകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-03-20",
    meeting_no: "9",
    meeting_type: "ധനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "അടിയന്തിര യോഗം/പ്രത്യേക യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-03-22",
    meeting_no: "5",
    meeting_type: "മരാമത്ത്കാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-03-27",
    meeting_no: "4",
    meeting_type: "വികസനകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "മുനിസിപ്പൽ കൗൺസിൽ ഹാൾ",
    category_code: "2",
  },
  {
    meeting_date: "2024-03-27",
    meeting_no: "3",
    meeting_type: "വിദ്യാഭ്യാസ കലാകായിക കാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "മുനിസിപ്പൽ കൗൺസിൽ ഹാൾ",
    category_code: "2",
  },
  {
    meeting_date: "2024-03-27",
    meeting_no: "7",
    meeting_type: "ആരോഗ്യകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
  {
    meeting_date: "2024-03-27",
    meeting_no: "4",
    meeting_type: "ക്ഷേമകാര്യ സ്റ്റാന്‍ഡിംഗ് കമ്മിറ്റി",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "സ്റ്റാന്റിംഗ് കമ്മിറ്റി ചെയർമാന്റെ ചേംബർ",
    category_code: "2",
  },
]);

/** Muttar Grama Panchayat, 2015-16: the earliest year Sakarma holds anything for. */
export const muttarMeetingRows: MeetingRow[] = withDocuments([
  {
    meeting_date: "2016-01-27",
    meeting_no: "2",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "സാധാരണ യോഗം",
    venue: "പഞ്ചായത്ത് കമ്മിറ്റി ഹാള്‍",
    category_code: "43",
  },
]);

/**
 * The first year each covered body has a record for. A year before it is
 * `no_record_for_year`, which is the case the page exists to keep apart from a
 * year with no meetings in it.
 */
const RECORD_STARTS: Record<string, string> = {
  M07025: "2023-2024",
  G04036: "2015-2016",
};

/** A body-year with counts, and the rows those counts were taken from. */
export function meetingsYear(
  lbCode: string,
  yearLabel: string,
  rows: MeetingRow[],
): MeetingsYear {
  const governing = rows.filter((r) => r.meeting_type.startsWith("\u0d2d\u0d30\u0d23\u0d38\u0d2e\u0d3f\u0d24\u0d3f")).length;
  const ordinary = rows.filter(
    (r) => r.meeting_nature === "\u0d38\u0d3e\u0d27\u0d3e\u0d30\u0d23 \u0d2f\u0d4b\u0d17\u0d02",
  ).length;
  const dates = rows.map((r) => r.meeting_date).filter((d): d is string => Boolean(d));

  return {
    lb_code: lbCode,
    year_label: yearLabel,
    is_complete: yearLabel !== OPEN_YEAR,
    body: bodyBlock(lbCode),
    available: true,
    reason_code: null,
    meetings: rows.length,
    governing_body: governing,
    standing_committee: rows.length - governing,
    ordinary,
    special: rows.length - ordinary,
    first_meeting: dates.length ? dates[0] : null,
    last_meeting: dates.length ? dates[dates.length - 1] : null,
    meeting_rows: rows,
    scope_note: SCOPE_NOTE,
    provenance: meetingsProvenance,
  };
}

function missing(
  lbCode: string,
  yearLabel: string,
  reason_code: MeetingsMissing["reason_code"],
  reason: string,
): MeetingsMissing {
  return {
    lb_code: lbCode,
    year_label: yearLabel,
    is_complete: yearLabel !== OPEN_YEAR,
    body: bodyBlock(lbCode),
    available: false,
    reason_code,
    reason,
    provenance: meetingsProvenance,
  };
}

// ---------------------------------------------------------------------------
// Which years each body has a record for
// ---------------------------------------------------------------------------

/**
 * `/api/bodies` with the per-body year lists the year control reads.
 *
 * The shared handler in `handlers.ts` predates them, and a body with no list
 * falls back to offering every year — which is the old behaviour, and not what
 * these tests are about. A test that cares about year availability installs
 * this with `server.use`.
 *
 * The lists are the fixture slice's own: Aluva's meeting record starts in
 * 2023-24, Muttar's in 2015-16, and Panoor has none.
 */
export const MEETING_YEARS: Record<string, string[]> = {
  M08032: ["2016-2017", "2023-2024", "2024-2025", "2025-2026"],
  M13057: ["2023-2024", "2024-2025"],
  B03024: ["2023-2024"],
  M07025: ["2023-2024", "2024-2025", "2025-2026"],
  G04036: ["2015-2016", "2023-2024"],
  G13064: [],
  D12001: ["2023-2024"],
};

export const bodiesWithYears = http.get("*/api/bodies", () =>
  HttpResponse.json({
    bodies: bodies.map((body) => ({
      ...body,
      meeting_years: MEETING_YEARS[body.lb_code] ?? [],
      finance_years: financialYears.map((y) => y.year_label),
      years_with_meetings: (MEETING_YEARS[body.lb_code] ?? []).length,
      years_with_finance: financialYears.length,
    })),
    count: bodies.length,
    districts,
    financial_years: financialYears,
    cycles,
    provenance,
  }),
);

// ---------------------------------------------------------------------------
// The documents themselves
// ---------------------------------------------------------------------------

/** A fragment shaped like the one `backend/app/artifacts.py` returns. */
export const REGISTER_HTML =
  "<table><tr><td>1</td><td>അജണ്ട :- </td></tr>" +
  "<tr><td colspan=\"2\"><p>Tender awarded at 88,500 rupees.</p></td></tr></table>";

function registerDocument(meetingId: number, kind: DocumentKind): RegisterDocument {
  return {
    meeting_id: meetingId,
    kind,
    kind_label: kind === "dr" ? "Decision register" : "Minutes",
    year_label: "2023-2024",
    meeting_date: "2023-10-12",
    meeting_no: "2",
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "സാധാരണ യോഗം",
    body: bodyBlock("M08032"),
    available: true,
    reason_code: null,
    html: REGISTER_HTML,
    source_path: `8/2/124/2023/245/${meetingId}/${kind === "dr" ? "dr" : "minutes"}.html`,
    byte_size: 448767,
    provenance: meetingsProvenance,
  };
}

export function registerMissing(
  meetingId: number,
  kind: DocumentKind,
): RegisterMissing {
  const label = kind === "dr" ? "Decision register" : "Minutes";
  return {
    meeting_id: meetingId,
    kind,
    kind_label: label,
    body: bodyBlock("M08032"),
    available: false,
    reason_code: "no_document_published",
    reason: `Sakarma published no ${label.toLowerCase()} for this meeting.`,
    provenance: meetingsProvenance,
  };
}

export const handlers = [
  http.get("*/api/meetings/register/:meetingId/:kind", ({ params }) => {
    const { meetingId, kind } = params as { meetingId: string; kind: string };
    if (kind !== "dr" && kind !== "minutes") {
      return HttpResponse.json(
        { detail: `${kind} is not a document type. Ask for dr or minutes.` },
        { status: 422 },
      );
    }
    const id = Number(meetingId);
    // The row the fixture gives no documents to. Asking for one anyway is what
    // a stale page would do, and the endpoint answers it rather than 404ing.
    const last = chalakudyMeetingRows[chalakudyMeetingRows.length - 1];
    if (id === last.meeting_id) return HttpResponse.json(registerMissing(id, kind));
    return HttpResponse.json(registerDocument(id, kind));
  }),

  http.get("*/api/meetings/:lb/:year", ({ params }) => {
    const { lb, year } = params as { lb: string; year: string };
    if (!knownCode(lb)) return notFound(lb);

    const body = bodies.find((b) => b.lb_code === lb)!;
    if (!body.has_meetings) {
      return HttpResponse.json(missing(lb, year, "not_covered", NOT_COVERED_REASON));
    }

    const starts = RECORD_STARTS[lb];
    if (starts && year < starts) {
      return HttpResponse.json(
        missing(
          lb,
          year,
          "no_record_for_year",
          `Sakarma holds no meeting record for ${year}.`,
        ),
      );
    }

    if (lb === "G04036") {
      return HttpResponse.json(meetingsYear(lb, year, muttarMeetingRows));
    }

    // Counted from the rows rather than copied from the shared fixture, so a
    // test can assert the two agree instead of assuming it.
    return HttpResponse.json(meetingsYear(lb, year, chalakudyMeetingRows));
  }),
];
